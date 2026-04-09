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

  // Regression: Bug 1 — GET /v1/sessions/current must use req.worktree, not a hardcoded path
  it('GET /v1/sessions/current returns 404 for a worktree with no tasks', async () => {
    // Create a task for /test/worktree
    await request(app)
      .patch('/v1/sessions/current')
      .send({ worktree: '/test/worktree', title: 'Task A', goal: 'goal' })

    // Querying a different worktree should NOT return Task A
    const res = await request(app).get('/v1/sessions/current').query({ worktree: '/other/project' })
    expect(res.status).toBe(404)
  })

  it('GET /v1/sessions/current returns the correct task for its specific worktree', async () => {
    // Create tasks for two worktrees (same underlying test DB via createTestPool)
    await request(app)
      .patch('/v1/sessions/current')
      .send({ worktree: '/project/alpha', title: 'Alpha Task', goal: 'alpha goal' })
    await request(app)
      .patch('/v1/sessions/current')
      .send({ worktree: '/project/beta', title: 'Beta Task', goal: 'beta goal' })

    // Querying /project/alpha should return Alpha Task, not Beta Task
    const res = await request(app).get('/v1/sessions/current').query({ worktree: '/project/alpha' })
    expect(res.status).toBe(200)
    expect(res.body.task.title).toBe('Alpha Task')
  })
})
