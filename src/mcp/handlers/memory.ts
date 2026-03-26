import Database from 'better-sqlite3'
import { z } from 'zod'
import {
  insertMemory,
  invalidateMemory as dbInvalidateMemory,
  MEMORY_TYPES,
  MEMORY_SCOPES,
} from '../../db/memories.js'
import { insertGlobalMemory } from '../../db/global.js'
import { buildContextPacket, type ContextPacket } from '../../retrieval/context-packet.js'
import { detectScopes } from '../../retrieval/scope-detector.js'

const RememberSchema = z.object({
  content: z.string().describe('The knowledge to store'),
  type: z.enum(MEMORY_TYPES),
  scope: z.enum(MEMORY_SCOPES),
  source: z.enum(['agent', 'manual']).optional().default('agent'),
  global: z.boolean().optional().default(false),
})

const RecallSchema = z.object({
  scopes: z.array(z.enum(MEMORY_SCOPES)).optional(),
  types: z.array(z.enum(MEMORY_TYPES)).optional(),
  query: z.string().optional(),
  include_global: z.boolean().optional().default(false),
  limit: z.number().int().min(1).max(50).optional(),
})

const InvalidateSchema = z.object({
  id: z.string(),
  reason: z.string().optional(),
})

export async function handleRemember(
  db: Database.Database,
  globalDb: Database.Database | null,
  params: unknown,
): Promise<{ id: string }> {
  const data = RememberSchema.parse(params)
  const confidence = data.source === 'manual' ? 0.8 : 0.5

  if (data.global) {
    if (!globalDb) throw new Error('Global DB not available — start server with global memory enabled')
    const id = insertGlobalMemory(globalDb, {
      type: data.type,
      scope: data.scope,
      content: data.content,
      confidence,
      source: data.source,
      project_origin: process.cwd(),
      project_hint: process.cwd().split('/').pop() ?? '',
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
  return { id }
}

export async function handleRecall(
  db: Database.Database,
  globalDb: Database.Database | null,
  params: unknown,
): Promise<ContextPacket> {
  const data = RecallSchema.parse(params)
  const detectedScopes = await detectScopes(process.cwd())

  return buildContextPacket(db, {
    detectedScopes,
    scopes: data.scopes,
    types: data.types,
    query: data.query,
    includeGlobal: data.include_global,
    limit: data.limit,
    globalDb: globalDb ?? undefined,
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
