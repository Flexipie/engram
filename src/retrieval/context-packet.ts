import Database from 'better-sqlite3'
import { queryMemories, queryMemoriesWithEmbeddings, type Memory, type GlobalMemory } from '../db/memories.js'
import { rankMemories, rankWithEmbeddings } from './ranker.js'
import { queryGlobalMemories } from '../db/global.js'
import type { EmbeddingService } from './embeddings.js'

export interface ContextPacket {
  critical: Memory[]
  relevant: Memory[]
  antipatterns: Memory[]
  global: GlobalMemory[]
  total_count: number
  scopes_available: string[]
  also_found?: {
    scopes: string[]
    total: number
  }
}

export async function buildContextPacket(
  db: Database.Database,
  opts: {
    detectedScopes: string[]
    scopes?: string[]
    types?: string[]
    query?: string
    includeGlobal?: boolean
    limit?: number
    globalDb?: Database.Database
    embeddingService?: EmbeddingService
  },
): Promise<ContextPacket> {
  const { detectedScopes, scopes, types, query, includeGlobal = true, limit = 15, globalDb, embeddingService } = opts

  // scopes_available: all unique scopes from all non-invalidated memories (not filtered)
  const allForScopes = queryMemories(db, { excludeInvalidated: true })
  const scopes_available = [...new Set(allForScopes.map((m) => m.scope))]

  // Use hybrid reranking if embedding service available and query provided.
  // When semantic search is active, fetch ALL candidates (not just FTS matches) so
  // memories that share meaning but not keywords are included.
  let ranked: (Memory & { _score: number })[]
  let total_count: number

  if (embeddingService?.available() && query) {
    const memoriesWithEmbeddings = queryMemoriesWithEmbeddings(db, { scopes, types, excludeInvalidated: true })
    total_count = memoriesWithEmbeddings.length
    const queryEmbedding = await embeddingService.embed(query)
    ranked = rankWithEmbeddings(memoriesWithEmbeddings, queryEmbedding, detectedScopes)
  } else {
    const allMemories = queryMemories(db, { scopes, types, query, excludeInvalidated: true })
    total_count = allMemories.length
    ranked = rankMemories(allMemories, detectedScopes)
  }

  const antipatterns: Memory[] = []
  const critical: Memory[] = []
  const relevant: Memory[] = []
  let cap = limit

  for (const m of ranked) {
    if (m.type === 'anti_pattern') {
      antipatterns.push(m)
      continue
    }
    if (cap <= 0) continue
    if (m._score > 0.8) {
      critical.push(m)
      cap--
    } else if (m._score >= 0.4) {
      relevant.push(m)
      cap--
    }
    // below 0.4 excluded
  }

  let global: GlobalMemory[] = []
  if (includeGlobal && globalDb) {
    const globalRaw = queryGlobalMemories(globalDb, { excludeInvalidated: true })
    const globalRanked = rankMemories(globalRaw as Memory[], detectedScopes)
    global = globalRanked.slice(0, 5) as unknown as GlobalMemory[]
  }

  // Compute also_found: memories in ranked that weren't returned (below score threshold or capped)
  const returnedIds = new Set([...critical, ...relevant, ...antipatterns].map((m) => m.id))
  const notReturned = ranked.filter((m) => !returnedIds.has(m.id))
  const also_found =
    notReturned.length > 0
      ? {
          scopes: [...new Set(notReturned.map((m) => m.scope))],
          total: ranked.length,
        }
      : undefined

  return {
    critical,
    relevant,
    antipatterns,
    global,
    total_count,
    scopes_available,
    also_found,
  }
}
