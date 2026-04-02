import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { createTestDb, createTestPool } from '../setup.js'
import { createTestApp } from '../test-app.js'
import type Database from 'better-sqlite3'
import type { Express } from 'express'

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
