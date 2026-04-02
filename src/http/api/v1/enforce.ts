import { Router } from 'express'
import type Database from 'better-sqlite3'
import { checkConventions } from '../../../enforcement/checker.js'
import { getActiveScopes } from '../../../domain/active-profile.js'
import type { EnforcementConfig } from '../../../enforcement/checker.js'

export function createEnforceV1Router(config: EnforcementConfig): Router {
  const router = Router()

  // POST /v1/enforce
  router.post('/', (req, res): void => {
    const db = req.db as Database.Database
    const { file_path, scope } = req.body as { file_path?: string; scope?: string }

    if (!file_path || typeof file_path !== 'string') {
      res.status(400).json({ error: 'file_path is required' })
      return
    }

    const scopeOverride = scope && getActiveScopes().includes(scope) ? scope : undefined

    try {
      const result = checkConventions(db, file_path, config, scopeOverride)
      res.json(result)
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  return router
}
