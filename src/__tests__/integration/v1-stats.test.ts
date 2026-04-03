import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import type Database from 'better-sqlite3'
import type { Express } from 'express'
import type { EnforcementStats } from '../../http/enforce.js'
import { createTestDb, createTestPool } from '../setup.js'
import { createTestApp } from '../test-app.js'
import { toolStats } from '../../http/stats.js'

function resetToolStats(): void {
  toolStats.session_start.calls = 0
  toolStats.session_start.task_hits = 0
  toolStats.remember.calls = 0
  toolStats.recall.calls = 0
  toolStats.recall.memories_returned = 0
  toolStats.check_error.calls = 0
  toolStats.check_error.hits = 0
  toolStats.record_error.calls = 0
  toolStats.invalidate.calls = 0
  toolStats.update_task.calls = 0
  toolStats.get_worktree_status.calls = 0
  toolStats.check_conventions.calls = 0
}

describe('GET /v1/stats', () => {
  let db: Database.Database
  let app: Express
  let enforcementStats: EnforcementStats

  beforeEach(() => {
    resetToolStats()
    db = createTestDb()
    enforcementStats = { checks: 0, violations: 0, warnings: 0 }
    const pool = createTestPool(db)
    app = createTestApp(pool, null, {}, enforcementStats)
  })

  afterEach(() => {
    db.close()
  })

  it('returns 200 with tools and enforcement fields', async () => {
    const res = await request(app).get('/v1/stats')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('tools')
    expect(res.body).toHaveProperty('enforcement')
  })

  it('tools object has all expected keys', async () => {
    const res = await request(app).get('/v1/stats')
    const { tools } = res.body as { tools: Record<string, unknown> }
    expect(tools).toHaveProperty('session_start')
    expect(tools).toHaveProperty('remember')
    expect(tools).toHaveProperty('recall')
    expect(tools).toHaveProperty('check_error')
    expect(tools).toHaveProperty('record_error')
    expect(tools).toHaveProperty('invalidate')
    expect(tools).toHaveProperty('update_task')
    expect(tools).toHaveProperty('get_worktree_status')
    expect(tools).toHaveProperty('check_conventions')
  })

  it('enforcement reflects injected stats', async () => {
    enforcementStats.checks = 5
    enforcementStats.violations = 2
    enforcementStats.warnings = 1
    const res = await request(app).get('/v1/stats')
    const { enforcement } = res.body as { enforcement: EnforcementStats }
    expect(enforcement.checks).toBe(5)
    expect(enforcement.violations).toBe(2)
    expect(enforcement.warnings).toBe(1)
  })

  it('tools.recall.memories_returned accumulates across calls', async () => {
    toolStats.recall.calls = 3
    toolStats.recall.memories_returned = 12
    const res = await request(app).get('/v1/stats')
    const { tools } = res.body as { tools: { recall: { calls: number; memories_returned: number } } }
    expect(tools.recall.calls).toBe(3)
    expect(tools.recall.memories_returned).toBe(12)
  })

  it('tools.check_error.hits tracks found results', async () => {
    toolStats.check_error.calls = 4
    toolStats.check_error.hits = 1
    const res = await request(app).get('/v1/stats')
    const { tools } = res.body as { tools: { check_error: { calls: number; hits: number } } }
    expect(tools.check_error.calls).toBe(4)
    expect(tools.check_error.hits).toBe(1)
  })
})
