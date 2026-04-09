import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { createTestDb, createTestPool } from '../setup.js'
import { createTestApp } from '../test-app.js'
import type Database from 'better-sqlite3'
import type { Express } from 'express'
import type { EmbeddingService } from '../../retrieval/embeddings.js'

describe('v1 memories CRUD', () => {
  let db: Database.Database
  let app: Express

  beforeEach(() => {
    db = createTestDb()
    const pool = createTestPool(db)
    app = createTestApp(pool, null)
  })

  afterEach(() => {
    db.close()
  })

  it('POST /v1/memories creates a memory', async () => {
    const res = await request(app)
      .post('/v1/memories')
      .send({ type: 'convention', scope: 'api', content: 'Always validate with Zod' })

    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('id')
    expect(typeof res.body.id).toBe('string')
  })

  it('POST /v1/memories returns 400 when type missing', async () => {
    const res = await request(app)
      .post('/v1/memories')
      .send({ scope: 'api', content: 'test' })

    expect(res.status).toBe(400)
  })

  it('POST /v1/memories returns 400 when content missing', async () => {
    const res = await request(app)
      .post('/v1/memories')
      .send({ type: 'convention', scope: 'api' })

    expect(res.status).toBe(400)
  })

  it('GET /v1/memories returns list', async () => {
    await request(app).post('/v1/memories').send({ type: 'convention', scope: 'api', content: 'test memory' })

    const res = await request(app).get('/v1/memories')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('memories')
    expect(Array.isArray(res.body.memories)).toBe(true)
    expect(res.body.memories.length).toBeGreaterThan(0)
    expect(res.body).toHaveProperty('total')
  })

  it('GET /v1/memories/:id returns one memory', async () => {
    const post = await request(app)
      .post('/v1/memories')
      .send({ type: 'convention', scope: 'api', content: 'findme' })
    const { id } = post.body as { id: string }

    const res = await request(app).get(`/v1/memories/${id}`)
    expect(res.status).toBe(200)
    expect(res.body.content).toBe('findme')
  })

  it('GET /v1/memories/:id returns 404 for unknown id', async () => {
    const res = await request(app).get('/v1/memories/nonexistent-id-xyz')
    expect(res.status).toBe(404)
  })

  it('PATCH /v1/memories/:id updates memory content', async () => {
    const post = await request(app)
      .post('/v1/memories')
      .send({ type: 'convention', scope: 'api', content: 'original content' })
    const { id } = post.body as { id: string }

    const res = await request(app).patch(`/v1/memories/${id}`).send({ content: 'updated content' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('DELETE /v1/memories/:id soft-deletes memory', async () => {
    const post = await request(app)
      .post('/v1/memories')
      .send({ type: 'convention', scope: 'api', content: 'to delete' })
    const { id } = post.body as { id: string }

    const res = await request(app)
      .delete(`/v1/memories/${id}`)
      .send({ reason: 'no longer relevant' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('GET /v1/memories filters by scope', async () => {
    await request(app).post('/v1/memories').send({ type: 'convention', scope: 'api', content: 'api memory' })
    await request(app).post('/v1/memories').send({ type: 'convention', scope: 'testing', content: 'test memory' })

    const res = await request(app).get('/v1/memories?scope=api')
    expect(res.status).toBe(200)
    expect(res.body.memories.every((m: { scope: string }) => m.scope === 'api')).toBe(true)
  })

  it('GET /v1/memories filters by type', async () => {
    await request(app).post('/v1/memories').send({ type: 'convention', scope: 'api', content: 'convention memory' })
    await request(app).post('/v1/memories').send({ type: 'decision', scope: 'api', content: 'decision memory' })

    const res = await request(app).get('/v1/memories?type=decision')
    expect(res.status).toBe(200)
    expect(res.body.memories.every((m: { type: string }) => m.type === 'decision')).toBe(true)
  })
})

// Regression: Bug 3 — POST /v1/memories bypassed the semantic pipeline
describe('v1 memories — semantic pipeline', () => {
  let db: Database.Database

  afterEach(() => {
    db.close()
    vi.restoreAllMocks()
  })

  it('POST /v1/memories calls EmbeddingService.embed when available', async () => {
    db = createTestDb()
    const pool = createTestPool(db)

    const mockService: EmbeddingService = {
      available: () => true,
      embed: vi.fn().mockResolvedValue(new Float32Array(4).fill(0.1)),
    }
    const app = createTestApp(pool, null, {}, undefined, mockService)

    const res = await request(app)
      .post('/v1/memories')
      .send({ type: 'convention', scope: 'api', content: 'use zod at boundaries' })

    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('id')
    expect(mockService.embed).toHaveBeenCalledWith('use zod at boundaries')
  })

  it('POST /v1/memories stores embedding in DB when service returns one', async () => {
    db = createTestDb()
    const pool = createTestPool(db)
    const vec = new Float32Array(4).fill(0.5)

    const mockService: EmbeddingService = {
      available: () => true,
      embed: vi.fn().mockResolvedValue(vec),
    }
    const app = createTestApp(pool, null, {}, undefined, mockService)

    const res = await request(app)
      .post('/v1/memories')
      .send({ type: 'convention', scope: 'api', content: 'embed this' })

    const { id } = res.body as { id: string }
    const row = db.prepare('SELECT embedding FROM memories WHERE id = ?').get(id) as { embedding: Buffer | null }
    expect(row.embedding).not.toBeNull()
  })

  it('POST /v1/memories returns contradicts_with when similarity threshold exceeded', async () => {
    db = createTestDb()
    const pool = createTestPool(db)

    // Mock service always returns the same vector — every pair will be identical (cosine sim = 1.0)
    const vec = new Float32Array(4).fill(0.5)
    const mockService: EmbeddingService = {
      available: () => true,
      embed: vi.fn().mockResolvedValue(vec),
    }
    const app = createTestApp(pool, null, {}, undefined, mockService)

    // Create a first memory
    await request(app)
      .post('/v1/memories')
      .send({ type: 'convention', scope: 'api', content: 'first rule' })

    // Second memory will have cosine sim = 1.0 with the first
    const res = await request(app)
      .post('/v1/memories')
      .send({ type: 'convention', scope: 'api', content: 'second rule' })

    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('contradicts_with')
    expect(Array.isArray(res.body.contradicts_with)).toBe(true)
    expect(res.body.contradicts_with.length).toBeGreaterThan(0)
  })

  it('POST /v1/memories with NoopEmbeddingService skips embedding (baseline)', async () => {
    db = createTestDb()
    const pool = createTestPool(db)
    // Default createTestApp uses NoopEmbeddingService
    const app = createTestApp(pool, null)

    const res = await request(app)
      .post('/v1/memories')
      .send({ type: 'convention', scope: 'api', content: 'no embedding needed' })

    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('id')
    // No contradicts_with when no embedding service
    expect(res.body.contradicts_with).toBeUndefined()
  })
})
