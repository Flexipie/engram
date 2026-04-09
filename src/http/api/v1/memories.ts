import { Router } from 'express'
import type Database from 'better-sqlite3'
import {
  queryMemories,
  getMemoryById,
  invalidateMemory,
  boostConfidence,
  decreaseConfidence,
  MEMORY_TYPES,
} from '../../../db/memories.js'
import { handleRemember } from '../../../mcp/handlers/memory.js'
import type { EmbeddingService } from '../../../retrieval/embeddings.js'

export function createMemoriesRouter(embeddingService?: EmbeddingService): Router {
  const router = Router()

  // POST /v1/memories — create (runs full semantic pipeline: embedding + contradiction detection)
  router.post('/', async (req, res): Promise<void> => {
    const db = req.db as Database.Database
    const { type, scope, content, source } = req.body as {
      type?: string
      scope?: string
      content?: string
      source?: string
    }

    if (!type || !(MEMORY_TYPES as readonly string[]).includes(type)) {
      res.status(400).json({ error: `type is required. Valid: ${MEMORY_TYPES.join(', ')}` })
      return
    }
    if (!scope || typeof scope !== 'string') {
      res.status(400).json({ error: 'scope is required' })
      return
    }
    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'content is required' })
      return
    }

    try {
      const result = await handleRemember(
        db,
        null,
        { type, scope, content, source: source ?? 'agent', worktree: req.worktree },
        embeddingService,
      )
      res.status(201).json(result)
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  // GET /v1/memories — list
  router.get('/', (req, res): void => {
    const db = req.db as Database.Database
    const { scope, type, query, minConfidence, limit } = req.query as Record<string, string | undefined>

    const memories = queryMemories(db, {
      scopes: scope ? [scope] : undefined,
      types: type ? [type] : undefined,
      query: query ?? undefined,
      minConfidence: minConfidence ? parseFloat(minConfidence) : undefined,
      excludeInvalidated: true,
    })

    const limitN = limit ? parseInt(limit, 10) : memories.length
    const sliced = memories.slice(0, limitN)

    res.json({ memories: sliced, total: sliced.length })
  })

  // GET /v1/memories/:id — get one
  router.get('/:id', (req, res): void => {
    const db = req.db as Database.Database
    const memory = getMemoryById(db, req.params['id'] as string)
    if (!memory) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json(memory)
  })

  // PATCH /v1/memories/:id — update (boost confidence or update content)
  router.patch('/:id', (req, res): void => {
    const db = req.db as Database.Database
    const id = req.params['id'] as string
    const { content, confidence } = req.body as { content?: string; confidence?: number }

    const existing = getMemoryById(db, id)
    if (!existing) {
      res.status(404).json({ error: 'Not found' })
      return
    }

    if (confidence !== undefined) {
      const delta = confidence - existing.confidence
      if (delta > 0) boostConfidence(db, id, delta)
      else if (delta < 0) decreaseConfidence(db, id, -delta)
    }

    if (content !== undefined) {
      db.prepare('UPDATE memories SET content = ?, updated_at = ? WHERE id = ?')
        .run(content, new Date().toISOString(), id)
    }

    res.json({ ok: true })
  })

  // DELETE /v1/memories/:id — soft delete
  router.delete('/:id', (req, res): void => {
    const db = req.db as Database.Database
    const { reason } = req.body as { reason?: string }
    const ok = invalidateMemory(db, req.params['id'] as string, reason)
    if (!ok) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json({ ok: true })
  })

  return router
}
