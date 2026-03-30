import type { RequestHandler } from 'express'
import Database from 'better-sqlite3'
import type { EnforcementStats } from './enforce.js'
import { getActiveWorktrees } from '../db/worktrees.js'

const startTime = Date.now()

export function createHealthHandler(
  db: Database.Database,
  stats: EnforcementStats,
): RequestHandler {
  return (_req, res): void => {
    const activeWorktrees = getActiveWorktrees(db)
    res.json({
      status: 'ok',
      pid: process.pid,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      version: '0.1.0',
      name: 'engram',
      active_worktrees: activeWorktrees.length,
      enforcement: {
        checks: stats.checks,
        violations: stats.violations,
        warnings: stats.warnings,
      },
    })
  }
}
