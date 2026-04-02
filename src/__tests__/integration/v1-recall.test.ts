import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { createTestDb, createTestPool } from '../setup.js'
import { createTestApp } from '../test-app.js'
import { insertMemory } from '../../db/memories.js'
import type Database from 'better-sqlite3'
import type { Express } from 'express'

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
