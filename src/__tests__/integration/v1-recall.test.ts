import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { createTestDb, createTestPool } from '../setup.js'
import { createTestApp } from '../test-app.js'
import { insertMemory } from '../../db/memories.js'
import type Database from 'better-sqlite3'
import type { Express } from 'express'
import type { EmbeddingService } from '../../retrieval/embeddings.js'

describe('v1 recall', () => {
  let db: Database.Database
  let app: Express

  beforeEach(() => {
    db = createTestDb()
    insertMemory(db, { type: 'convention', scope: 'api', content: 'Use Zod for validation', source: 'manual', confidence: 0.8 })
    insertMemory(db, { type: 'anti_pattern', scope: 'testing', content: 'Never mock the database', source: 'manual', confidence: 0.9 })
    const pool = createTestPool(db)
    app = createTestApp(pool, null)
  })

  afterEach(() => {
    db.close()
  })

  it('POST /v1/recall returns context packet structure', async () => {
    const res = await request(app).post('/v1/recall').send({})

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('critical')
    expect(res.body).toHaveProperty('relevant')
    expect(res.body).toHaveProperty('antipatterns')
    expect(res.body).toHaveProperty('total_count')
  })

  it('POST /v1/recall with query filters memories', async () => {
    const res = await request(app).post('/v1/recall').send({ query: 'zod' })

    expect(res.status).toBe(200)
    const allMemories = [...res.body.critical, ...res.body.relevant, ...res.body.antipatterns]
    expect(allMemories.length).toBeGreaterThan(0)
  })

  it('POST /v1/recall with scopes filter', async () => {
    const res = await request(app).post('/v1/recall').send({ scopes: ['api'] })

    expect(res.status).toBe(200)
    const allMemories = [
      ...(res.body.critical as Array<{ scope: string }>),
      ...(res.body.relevant as Array<{ scope: string }>),
    ]
    if (allMemories.length > 0) {
      expect(allMemories.every((m) => m.scope === 'api')).toBe(true)
    }
  })

  it('POST /v1/recall separates anti-patterns', async () => {
    const res = await request(app).post('/v1/recall').send({})

    expect(res.status).toBe(200)
    expect(res.body.antipatterns.length).toBeGreaterThan(0)
  })
})

// Regression: Bug 2 + Bug 3 — worktree and embeddingService must flow through REST recall
describe('v1 recall — worktree and embedding wiring', () => {
  let db: Database.Database

  afterEach(() => {
    db.close()
    vi.restoreAllMocks()
  })

  it('POST /v1/recall passes embeddingService to handleRecall', async () => {
    db = createTestDb()
    insertMemory(db, { type: 'convention', scope: 'api', content: 'zod validation', source: 'manual', confidence: 0.8 })
    const pool = createTestPool(db)

    const mockService: EmbeddingService = {
      available: () => true,
      embed: vi.fn().mockResolvedValue(new Float32Array(4).fill(0.1)),
    }
    const app = createTestApp(pool, null, {}, undefined, mockService)

    const res = await request(app).post('/v1/recall').send({ query: 'zod' })
    expect(res.status).toBe(200)
    // embed should have been called for the query
    expect(mockService.embed).toHaveBeenCalledWith('zod')
  }, 10000)

  it('POST /v1/recall with explicit worktree param completes without timeout', async () => {
    // Regression for Bug 2: if process.cwd() is used instead of req.worktree,
    // detectScopes runs git in the actual large repo which can time out.
    // Passing a non-git path forces git to fail fast.
    db = createTestDb()
    const pool = createTestPool(db)
    const app = createTestApp(pool, null)

    const res = await request(app)
      .post('/v1/recall')
      .send({ worktree: '/tmp/not-a-git-repo-xyz' })

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('total_count')
  }, 10000)
})
