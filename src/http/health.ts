import type { RequestHandler } from 'express'
import type { EnforcementStats } from './enforce.js'
import { toolStats } from './stats.js'
import { getActiveWorktrees } from '../db/worktrees.js'
import { DbPool } from '../db/pool.js'

const startTime = Date.now()

export function createHealthHandler(
  pool: DbPool,
  stats: EnforcementStats,
  mode: 'global' | 'project' = 'project',
): RequestHandler {
  return (_req, res): void => {
    const allDbs = pool.getAllDbs()
    const activeWorktreesCount = allDbs.flatMap((db) => getActiveWorktrees(db)).length
    res.json({
      status: 'ok',
      pid: process.pid,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      version: '0.1.0',
      name: 'engram',
      mode,
      active_worktrees: activeWorktreesCount,
      enforcement: {
        checks: stats.checks,
        violations: stats.violations,
        warnings: stats.warnings,
      },
      tools: toolStats,
    })
  }
}
