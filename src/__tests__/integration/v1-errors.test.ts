import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { createTestDb, createTestPool } from '../setup.js'
import { createTestApp } from '../test-app.js'
import type Database from 'better-sqlite3'
import type { Express } from 'express'

describe('v1 errors', () => {
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

  it('POST /v1/errors/check returns not found for unknown error', async () => {
    const res = await request(app)
      .post('/v1/errors/check')
      .send({ error_raw: 'TypeError: cannot read property of undefined' })

    expect(res.status).toBe(200)
    expect(res.body.found).toBe(false)
    expect(res.body).toHaveProperty('signature')
  })

  it('POST /v1/errors/record stores an error pattern', async () => {
    const res = await request(app)
      .post('/v1/errors/record')
      .send({
        error_raw: 'TypeError: cannot read property of undefined',
        cause: 'Missing null check',
        fix: 'Add optional chaining',
      })

    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('id')
  })

  it('round trip: record then check returns the fix', async () => {
    const errorRaw = 'SyntaxError: unexpected token at line 42'
    await request(app)
      .post('/v1/errors/record')
      .send({ error_raw: errorRaw, cause: 'missing comma', fix: 'add comma' })

    const res = await request(app)
      .post('/v1/errors/check')
      .send({ error_raw: errorRaw })

    expect(res.status).toBe(200)
    expect(res.body.found).toBe(true)
    expect(res.body.fix).toBe('add comma')
  })

  it('GET /v1/errors returns list of error patterns', async () => {
    await request(app)
      .post('/v1/errors/record')
      .send({ error_raw: 'some error xyz', cause: 'test cause', fix: 'test fix' })

    const res = await request(app).get('/v1/errors')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('errors')
    expect(Array.isArray(res.body.errors)).toBe(true)
    expect(res.body.errors.length).toBeGreaterThan(0)
  })
})
