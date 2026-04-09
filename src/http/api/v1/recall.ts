import { Router } from 'express'
import type Database from 'better-sqlite3'
import { handleRecall } from '../../../mcp/handlers/memory.js'
import type { EmbeddingService } from '../../../retrieval/embeddings.js'

export function createRecallRouter(globalDb: Database.Database | null, embeddingService?: EmbeddingService): Router {
  const router = Router()

  // POST /v1/recall
  router.post('/', async (req, res): Promise<void> => {
    const db = req.db as Database.Database
    try {
      const result = await handleRecall(db, globalDb, { ...req.body, worktree: req.worktree }, embeddingService)
      res.json(result)
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  return router
}
