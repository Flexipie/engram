import Database from 'better-sqlite3'
import { queryMemories, type Memory, type GlobalMemory } from '../db/memories.js'
import { rankMemories } from './ranker.js'
import { queryGlobalMemories } from '../db/global.js'

export interface ContextPacket {
  critical: Memory[]
  relevant: Memory[]
  antipatterns: Memory[]
  global: GlobalMemory[]
  total_count: number
  scopes_available: string[]
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
  },
): Promise<ContextPacket> {
  const { detectedScopes, scopes, types, query, includeGlobal = false, limit = 15, globalDb } = opts

  // Query all non-invalidated memories with optional filters
  const allMemories = queryMemories(db, { scopes, types, query, excludeInvalidated: true })

  // scopes_available: all unique scopes from all non-invalidated memories (not filtered)
  const allForScopes = queryMemories(db, { excludeInvalidated: true })
  const scopes_available = [...new Set(allForScopes.map((m) => m.scope))]

  const total_count = allMemories.length

  // Rank memories
  const ranked = rankMemories(allMemories, detectedScopes)

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
    global = globalRanked.slice(0, 5) as GlobalMemory[]
  }

  return {
    critical,
    relevant,
    antipatterns,
    global,
    total_count,
    scopes_available,
  }
}
