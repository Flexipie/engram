import type { Request, Response } from 'express'
import { getActiveTask, createSnapshot } from '../db/tasks.js'
import { logger } from '../logger.js'
import { DbPool } from '../db/pool.js'

export function createSnapshotHandler(pool: DbPool) {
  return (req: Request, res: Response): void => {
    const { worktree, trigger } = req.body as {
      worktree?: string
      trigger: string
    }

    if (!trigger || typeof trigger !== 'string') {
      res.status(400).json({ error: 'trigger is required' })
      return
    }

    let db
    try {
      db = pool.resolve(worktree)
    } catch {
      res.status(400).json({ error: 'worktree is required in global mode' })
      return
    }

    try {
      const targetWorktree = worktree ?? pool.defaultWorktree ?? process.cwd()
      const taskResult = getActiveTask(db, targetWorktree)

      if (!taskResult) {
        res.json({ ok: false, reason: 'No active task for this worktree' })
        return
      }

      const snapshotId = createSnapshot(db, taskResult.task.id, trigger)
      res.json({ ok: true, snapshot_id: snapshotId })
    } catch (err) {
      logger.error('snapshot failed', err)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}
