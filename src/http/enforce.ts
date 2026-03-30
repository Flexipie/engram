import type { RequestHandler } from 'express'
import { checkConventions, type EnforcementConfig } from '../enforcement/checker.js'
import { MEMORY_SCOPES, type MemoryScope } from '../db/memories.js'
import { logger } from '../logger.js'
import { DbPool } from '../db/pool.js'

export interface EnforcementStats {
  checks: number
  violations: number
  warnings: number
}

export function createEnforceHandler(
  pool: DbPool,
  config: EnforcementConfig,
  stats: EnforcementStats,
): RequestHandler {
  return (req, res): void => {
    const { file_path, scope, worktree } = req.body as {
      file_path?: string
      scope?: string
      worktree?: string
    }

    if (!file_path || typeof file_path !== 'string') {
      res.status(400).json({ error: 'file_path is required' })
      return
    }

    const scopeOverride = scope && (MEMORY_SCOPES as readonly string[]).includes(scope)
      ? (scope as MemoryScope)
      : undefined

    let db
    try {
      db = pool.resolve(worktree)
    } catch {
      res.status(400).json({ error: 'worktree is required in global mode' })
      return
    }

    try {
      const result = checkConventions(db, file_path, config, scopeOverride)

      stats.checks++
      if (result.violations.length > 0) stats.violations += result.violations.length
      if (result.warnings.length > 0) stats.warnings += result.warnings.length

      res.json(result)
    } catch (err) {
      logger.error('enforce failed', err)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}
