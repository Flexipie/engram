import type { Request, Response } from 'express'
import { upsertWorktreeActivity } from '../db/worktrees.js'
import { logger } from '../logger.js'
import { DbPool } from '../db/pool.js'

export function createHeartbeatHandler(pool: DbPool) {
  return (req: Request, res: Response): void => {
    const { worktree, task_id, active_files } = req.body as {
      worktree: string
      task_id?: string
      active_files?: string[]
    }

    if (!worktree || typeof worktree !== 'string') {
      res.status(400).json({ error: 'worktree is required' })
      return
    }

    try {
      const db = pool.resolve(worktree)
      upsertWorktreeActivity(db, worktree, task_id, active_files)
      res.json({ ok: true })
    } catch (err) {
      logger.error('heartbeat failed', err)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}
