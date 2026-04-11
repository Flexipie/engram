import Database from 'better-sqlite3'
import { z } from 'zod'
import {
  insertMemory,
  invalidateMemory as dbInvalidateMemory,
  queryMemoriesWithEmbeddings,
  updateMemoryEmbedding,
  MEMORY_TYPES,
} from '../../db/memories.js'
import { getActiveScopes } from '../../domain/active-profile.js'
import { insertGlobalMemory } from '../../db/global.js'
import { buildContextPacket, type ContextPacket } from '../../retrieval/context-packet.js'
import { detectScopes } from '../../retrieval/scope-detector.js'
import type { EmbeddingService } from '../../retrieval/embeddings.js'
import { cosine, deserializeEmbedding, serializeEmbedding } from '../../retrieval/embeddings.js'

const scopeField = () => z.string().refine(
  s => getActiveScopes().includes(s),
  s => ({ message: `Invalid scope "${s}". Valid: ${getActiveScopes().join(', ')}` }),
)

const RememberSchema = z.object({
  content: z.string().describe('The knowledge to store'),
  type: z.enum(MEMORY_TYPES),
  scope: scopeField(),
  source: z.enum(['agent', 'manual', 'observer']).optional().default('agent'),
  global: z.boolean().optional().default(false),
  worktree: z.string().optional(),
})

const RecallSchema = z.object({
  scopes: z.array(scopeField()).optional(),
  types: z.array(z.enum(MEMORY_TYPES)).optional(),
  query: z.string().optional(),
  include_global: z.boolean().optional().default(true),
  limit: z.number().int().min(1).max(50).optional(),
  worktree: z.string().optional(),
})

const InvalidateSchema = z.object({
  id: z.string(),
  reason: z.string().optional(),
})

export interface ContradictionWarning {
  id: string
  content: string
  similarity: number
}

export interface RememberResult {
  id: string
  contradicts_with?: ContradictionWarning[]
}

export async function handleRemember(
  db: Database.Database,
  globalDb: Database.Database | null,
  params: unknown,
  embeddingService?: EmbeddingService,
  contradictionThreshold = 0.85,
): Promise<RememberResult> {
  const data = RememberSchema.parse(params)
  const confidence = data.source === 'manual' ? 0.8 : data.source === 'observer' ? 0.4 : 0.5
  const worktree = data.worktree ?? process.cwd()

  if (data.global) {
    if (!globalDb) throw new Error('Global DB not available — start server with global memory enabled')
    const id = insertGlobalMemory(globalDb, {
      type: data.type,
      scope: data.scope,
      content: data.content,
      confidence,
      source: data.source,
      project_origin: worktree,
      project_hint: worktree.split('/').pop() ?? '',
    })
    return { id }
  }

  const id = insertMemory(db, {
    type: data.type,
    scope: data.scope,
    content: data.content,
    confidence,
    source: data.source,
  })

  // Embedding: generate + store, then check for contradictions
  if (embeddingService?.available()) {
    const embedding = await embeddingService.embed(data.content)
    if (embedding) {
      updateMemoryEmbedding(db, id, serializeEmbedding(embedding))

      // Contradiction detection: compare against existing memories
      const existing = queryMemoriesWithEmbeddings(db, { excludeInvalidated: true })
      const contradictions: ContradictionWarning[] = []
      for (const m of existing) {
        if (m.id === id || !m.embedding) continue
        const sim = cosine(embedding, deserializeEmbedding(m.embedding))
        if (sim >= contradictionThreshold) {
          contradictions.push({ id: m.id, content: m.content, similarity: sim })
        }
      }
      if (contradictions.length > 0) {
        return { id, contradicts_with: contradictions }
      }
    }
  }

  return { id }
}

export async function handleRecall(
  db: Database.Database,
  globalDb: Database.Database | null,
  params: unknown,
  embeddingService?: EmbeddingService,
): Promise<ContextPacket> {
  const data = RecallSchema.parse(params)
  const detectedScopes = await detectScopes(data.worktree ?? process.cwd())

  return buildContextPacket(db, {
    detectedScopes,
    scopes: data.scopes,
    types: data.types,
    query: data.query,
    includeGlobal: data.include_global,
    limit: data.limit,
    globalDb: globalDb ?? undefined,
    embeddingService,
  })
}

export async function handleInvalidate(
  db: Database.Database,
  params: unknown,
): Promise<{ ok: boolean }> {
  const data = InvalidateSchema.parse(params)
  const ok = dbInvalidateMemory(db, data.id, data.reason)
  return { ok }
}
