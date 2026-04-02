import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { createTestDb, createTestPool } from '../setup.js'
import { createTestApp } from '../test-app.js'
import type Database from 'better-sqlite3'
import type { Express } from 'express'

describe('GET /openapi.json', () => {
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

  it('returns a valid OpenAPI 3.1 spec', async () => {
    const res = await request(app).get('/openapi.json')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('openapi', '3.1.0')
    expect(res.body).toHaveProperty('info')
    expect(res.body).toHaveProperty('paths')
    expect(res.body.info).toHaveProperty('version', '1')
  })

  it('spec contains /v1/memories path', async () => {
    const res = await request(app).get('/openapi.json')
    expect(res.body.paths).toHaveProperty('/v1/memories')
  })

  it('spec contains /v1/recall path', async () => {
    const res = await request(app).get('/openapi.json')
    expect(res.body.paths).toHaveProperty('/v1/recall')
  })

  it('spec contains components/schemas/Memory', async () => {
    const res = await request(app).get('/openapi.json')
    expect(res.body.components.schemas).toHaveProperty('Memory')
  })

  it('spec does not require auth to access', async () => {
    const appWithAuth = createTestApp(createTestPool(db), null, {
      apiKeyRequired: true,
      apiKeys: [],
    })
    const res = await request(appWithAuth).get('/openapi.json')
    // openapi.json is served outside of /v1, so no auth middleware
    expect(res.status).toBe(200)
  })
})
