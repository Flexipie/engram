import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import type { Request, Response } from 'express'
import { createTestDb, teardownDb } from '../setup.js'
import { createHeartbeatHandler } from '../../http/heartbeat.js'
import { getActiveWorktrees, pruneStale } from '../../db/worktrees.js'

function mockReqRes(body: unknown) {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this },
    json(data: unknown) { this.body = data },
  }
  return { req: { body } as Request, res }
}

describe('POST /heartbeat handler', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    teardownDb(db)
  })

  it('returns 400 when worktree is missing', () => {
    const handler = createHeartbeatHandler(db)
    const { req, res } = mockReqRes({})
    handler(req, res as unknown as Response)
    expect(res.statusCode).toBe(400)
  })

  it('returns { ok: true } on valid heartbeat', () => {
    const handler = createHeartbeatHandler(db)
    const { req, res } = mockReqRes({ worktree: '/projects/app' })
    handler(req, res as unknown as Response)
    expect(res.statusCode).toBe(200)
    expect((res.body as { ok: boolean }).ok).toBe(true)
  })

  it('creates a worktree_activity row on first heartbeat', () => {
    const handler = createHeartbeatHandler(db)
    const { req, res } = mockReqRes({ worktree: '/projects/app' })
    handler(req, res as unknown as Response)

    const worktrees = getActiveWorktrees(db)
    expect(worktrees).toHaveLength(1)
    expect(worktrees[0].worktree).toBe('/projects/app')
  })

  it('upserts — multiple heartbeats from same worktree produce one row', () => {
    const handler = createHeartbeatHandler(db)
    const body = { worktree: '/projects/app' }
    handler({ body } as Request, mockReqRes(body).res as unknown as Response)
    handler({ body } as Request, mockReqRes(body).res as unknown as Response)
    handler({ body } as Request, mockReqRes(body).res as unknown as Response)

    const worktrees = getActiveWorktrees(db)
    expect(worktrees.filter(w => w.worktree === '/projects/app')).toHaveLength(1)
  })

  it('stores active_files from heartbeat', () => {
    const handler = createHeartbeatHandler(db)
    const { req, res } = mockReqRes({
      worktree: '/projects/app',
      active_files: ['src/api/handler.ts', 'src/db/schema.ts'],
    })
    handler(req, res as unknown as Response)

    const [wt] = getActiveWorktrees(db)
    expect(wt.active_files).toContain('src/api/handler.ts')
    expect(wt.active_files).toContain('src/db/schema.ts')
  })

  it('stores task_id from heartbeat', () => {
    const handler = createHeartbeatHandler(db)
    const { req, res } = mockReqRes({
      worktree: '/projects/app',
      task_id: 'task-abc-123',
    })
    handler(req, res as unknown as Response)

    const [wt] = getActiveWorktrees(db)
    expect(wt.task_id).toBe('task-abc-123')
  })

  it('updates last_heartbeat on subsequent calls', async () => {
    const handler = createHeartbeatHandler(db)
    const body = { worktree: '/projects/app' }

    handler({ body } as Request, mockReqRes(body).res as unknown as Response)
    const [first] = getActiveWorktrees(db)

    // Small delay to ensure timestamp changes
    await new Promise(r => setTimeout(r, 10))

    handler({ body } as Request, mockReqRes(body).res as unknown as Response)
    const [second] = getActiveWorktrees(db)

    expect(new Date(second.last_heartbeat).getTime())
      .toBeGreaterThanOrEqual(new Date(first.last_heartbeat).getTime())
  })
})

describe('pruneStale', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    teardownDb(db)
  })

  it('removes worktrees with last_heartbeat older than maxAgeMs', () => {
    // Insert a stale row manually
    const staleTime = new Date(Date.now() - 20 * 60 * 1000).toISOString() // 20 min ago
    db.prepare(
      'INSERT INTO worktree_activity (worktree, task_id, active_files, last_heartbeat) VALUES (?, ?, ?, ?)',
    ).run('/stale/worktree', null, '[]', staleTime)

    pruneStale(db, 10 * 60 * 1000) // 10 min threshold
    const remaining = getActiveWorktrees(db)
    expect(remaining.map(w => w.worktree)).not.toContain('/stale/worktree')
  })

  it('keeps worktrees with recent last_heartbeat', () => {
    const handler = createHeartbeatHandler(db)
    const { req, res } = mockReqRes({ worktree: '/projects/app' })
    handler(req, res as unknown as Response)

    pruneStale(db, 10 * 60 * 1000)
    const remaining = getActiveWorktrees(db)
    expect(remaining.map(w => w.worktree)).toContain('/projects/app')
  })

  it('prunes stale and keeps fresh in the same call', () => {
    const staleTime = new Date(Date.now() - 20 * 60 * 1000).toISOString()
    db.prepare(
      'INSERT INTO worktree_activity (worktree, task_id, active_files, last_heartbeat) VALUES (?, ?, ?, ?)',
    ).run('/stale/worktree', null, '[]', staleTime)

    const handler = createHeartbeatHandler(db)
    const { req, res } = mockReqRes({ worktree: '/projects/fresh' })
    handler(req, res as unknown as Response)

    pruneStale(db, 10 * 60 * 1000)
    const remaining = getActiveWorktrees(db)
    expect(remaining.map(w => w.worktree)).toContain('/projects/fresh')
    expect(remaining.map(w => w.worktree)).not.toContain('/stale/worktree')
  })
})
