import { Router } from 'express'
import type Database from 'better-sqlite3'
import { handleCheckError, handleRecordError } from '../../../mcp/handlers/error.js'
import { listErrorPatterns } from '../../../db/errors.js'

export function createErrorsRouter(): Router {
  const router = Router()

  // POST /v1/errors/check
  router.post('/check', async (req, res): Promise<void> => {
    const db = req.db as Database.Database
    try {
      const result = await handleCheckError(db, req.body)
      res.json(result)
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  // POST /v1/errors/record
  router.post('/record', async (req, res): Promise<void> => {
    const db = req.db as Database.Database
    try {
      const result = await handleRecordError(db, req.body)
      res.status(201).json(result)
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  // GET /v1/errors
  router.get('/', (req, res): void => {
    const db = req.db as Database.Database
    const { scope, limit } = req.query as { scope?: string; limit?: string }
    const errors = listErrorPatterns(db, { scope })
    const limitN = limit ? parseInt(limit, 10) : errors.length
    res.json({ errors: errors.slice(0, limitN) })
  })

  return router
}
