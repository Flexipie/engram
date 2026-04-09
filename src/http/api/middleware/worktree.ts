import type { RequestHandler } from 'express'
import type { DbPool } from '../../../db/pool.js'
import type Database from 'better-sqlite3'

declare module 'express-serve-static-core' {
  interface Request {
    db?: Database.Database
    worktree?: string
  }
}

export function createWorktreeMiddleware(pool: DbPool): RequestHandler {
  return (req, res, next): void => {
    const worktree = (req.query['worktree'] as string | undefined)
      ?? (req.body as { worktree?: string } | undefined)?.worktree

    try {
      req.db = pool.resolve(worktree)
      req.worktree = worktree
      next()
    } catch {
      res.status(400).json({ error: 'worktree is required in global mode' })
    }
  }
}
