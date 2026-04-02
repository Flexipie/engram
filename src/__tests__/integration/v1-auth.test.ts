import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { createHash } from 'crypto'
import { createTestDb, createTestPool } from '../setup.js'
import { createTestApp } from '../test-app.js'
import type Database from 'better-sqlite3'
import type { Express } from 'express'

describe('v1 auth - off by default', () => {
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

  it('allows requests without auth when apiKeyRequired is false', async () => {
    const res = await request(app).get('/v1/memories')
    expect(res.status).toBe(200)
  })

  it('allows requests with any header when auth is disabled', async () => {
    const res = await request(app)
      .get('/v1/memories')
      .set('Authorization', 'Bearer sometoken')
    expect(res.status).toBe(200)
  })
})

describe('v1 auth - enabled', () => {
  let db: Database.Database
  let app: Express
  const rawKey = 'test-api-key-secret'
  const keyHash = createHash('sha256').update(rawKey).digest('hex')

  beforeEach(() => {
    db = createTestDb()
    const pool = createTestPool(db)
    app = createTestApp(pool, null, { apiKeyRequired: true, apiKeys: [keyHash] })
  })

  afterEach(() => {
    db.close()
  })

  it('returns 401 for requests without auth', async () => {
    const res = await request(app).get('/v1/memories')
    expect(res.status).toBe(401)
  })

  it('returns 401 for wrong token', async () => {
    const res = await request(app)
      .get('/v1/memories')
      .set('Authorization', 'Bearer wrong-token')
    expect(res.status).toBe(401)
  })

  it('allows requests with valid token', async () => {
    const res = await request(app)
      .get('/v1/memories')
      .set('Authorization', `Bearer ${rawKey}`)
    expect(res.status).toBe(200)
  })

  it('POST /v1/memories works with valid token', async () => {
    const res = await request(app)
      .post('/v1/memories')
      .set('Authorization', `Bearer ${rawKey}`)
      .send({ type: 'convention', scope: 'api', content: 'authed memory' })
    expect(res.status).toBe(201)
  })
})
