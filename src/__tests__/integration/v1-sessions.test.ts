import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { createTestDb, createTestPool } from '../setup.js'
import { createTestApp } from '../test-app.js'
import type Database from 'better-sqlite3'
import type { Express } from 'express'

describe('v1 sessions', () => {
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

  it('POST /v1/sessions starts a session and returns context packet', async () => {
    const res = await request(app)
      .post('/v1/sessions')
      .send({ worktree: '/test/worktree' })

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('memories')
  })

  it('GET /v1/sessions/current returns 404 when no active task', async () => {
    const res = await request(app).get('/v1/sessions/current').query({ worktree: '/test/worktree' })
    expect(res.status).toBe(404)
  })

  it('PATCH /v1/sessions/current creates a task', async () => {
    const res = await request(app)
      .patch('/v1/sessions/current')
      .send({ worktree: '/test/worktree', title: 'My Task', goal: 'Do stuff' })

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('task_id')
  })

  it('GET /v1/sessions/current returns task after creation', async () => {
    await request(app)
      .patch('/v1/sessions/current')
      .send({ worktree: '/test/worktree', title: 'My Task', goal: 'Do stuff' })

    const res = await request(app).get('/v1/sessions/current').query({ worktree: '/test/worktree' })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('task')
    expect(res.body.task.title).toBe('My Task')
  })
})
