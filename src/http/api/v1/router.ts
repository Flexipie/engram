import { Router } from 'express'
import type Database from 'better-sqlite3'
import { createAuthMiddleware } from '../middleware/auth.js'
import { createWorktreeMiddleware } from '../middleware/worktree.js'
import { createMemoriesRouter } from './memories.js'
import { createSessionsRouter } from './sessions.js'
import { createErrorsRouter } from './errors.js'
import { createRecallRouter } from './recall.js'
import { createEnforceV1Router } from './enforce.js'
import { createStatsRouter } from './stats.js'
import type { EngramConfig } from '../../../config.js'
import type { DbPool } from '../../../db/pool.js'
import type { EnforcementStats } from '../../enforce.js'

export function createV1Router(
  pool: DbPool,
  globalDb: Database.Database | null,
  config: EngramConfig,
  enforcementStats?: EnforcementStats,
): Router {
  const router = Router()

  // Auth middleware — applies to all v1 routes
  router.use(createAuthMiddleware(config))

  // Worktree middleware — resolves req.db for all v1 routes
  router.use(createWorktreeMiddleware(pool))

  // Mount sub-routers
  router.use('/memories', createMemoriesRouter())
  router.use('/sessions', createSessionsRouter(globalDb))
  router.use('/errors', createErrorsRouter())
  router.use('/recall', createRecallRouter(globalDb))
  router.use('/enforce', createEnforceV1Router(config))
  router.use('/stats', createStatsRouter(enforcementStats ?? { checks: 0, violations: 0, warnings: 0 }))

  return router
}
