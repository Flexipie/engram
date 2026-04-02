import { Router } from 'express'
import type Database from 'better-sqlite3'
import { handleSessionStart, handleUpdateTask } from '../../../mcp/handlers/session.js'
import { createSnapshot } from '../../../db/tasks.js'

export function createSessionsRouter(globalDb: Database.Database | null): Router {
  const router = Router()

  // POST /v1/sessions — start/resume session (returns ContextPacket)
  router.post('/', async (req, res): Promise<void> => {
    const db = req.db as Database.Database
    const body = req.body as { worktree?: string; context_hint?: string }
    try {
      const result = await handleSessionStart(db, {
        worktree: body.worktree,
        context_hint: body.context_hint,
      }, globalDb)
      res.json(result)
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  // GET /v1/sessions/current — get current task
  router.get('/current', (req, res): void => {
    const db = req.db as Database.Database
    const worktree = (req.query['worktree'] as string | undefined) ?? '/test/worktree'
    const task = db.prepare(
      `SELECT id, worktree, title, goal, status, session_id, started_at, updated_at, archived_at
       FROM tasks WHERE worktree = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1`,
    ).get(worktree) as { id: string } | undefined

    if (!task) {
      res.status(404).json({ error: 'No active task' })
      return
    }

    const state = db.prepare(
      `SELECT * FROM task_state WHERE task_id = ? ORDER BY updated_at DESC LIMIT 1`,
    ).get(task.id)

    res.json({ task, state: state ?? null })
  })

  // PATCH /v1/sessions/current — create or update task
  router.patch('/current', async (req, res): Promise<void> => {
    const db = req.db as Database.Database
    try {
      const result = await handleUpdateTask(db, req.body)
      res.json(result)
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  // POST /v1/sessions/:id/snapshot — create snapshot
  router.post('/:id/snapshot', (req, res): void => {
    const db = req.db as Database.Database
    const taskId = req.params['id'] as string
    const { trigger } = req.body as { trigger?: string }
    try {
      const snapshotId = createSnapshot(db, taskId, trigger ?? 'manual')
      res.status(201).json({ snapshot_id: snapshotId })
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  return router
}
