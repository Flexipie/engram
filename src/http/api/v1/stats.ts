import { Router } from 'express'
import type { EnforcementStats } from '../../enforce.js'
import { toolStats } from '../../stats.js'

export function createStatsRouter(enforcementStats: EnforcementStats): Router {
  const router = Router()

  router.get('/', (_req, res): void => {
    res.json({
      tools: toolStats,
      enforcement: {
        checks: enforcementStats.checks,
        violations: enforcementStats.violations,
        warnings: enforcementStats.warnings,
      },
    })
  })

  return router
}
