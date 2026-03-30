import Database from 'better-sqlite3'
import { queryMemories } from '../db/memories.js'
import { rankMemories } from '../retrieval/ranker.js'
import { fileToScope } from '../retrieval/scope-detector.js'

export interface EnforcementResult {
  scope: string
  violations: string[]
  warnings: string[]
  memories_checked: number
}

export interface EnforcementConfig {
  warnThreshold: number
  blockThreshold: number
}

const ENFORCEMENT_TYPES = ['convention', 'anti_pattern', 'decision'] as const

export function checkConventions(
  db: Database.Database,
  filePath: string,
  config: EnforcementConfig,
  scopeOverride?: string,
): EnforcementResult {
  const scope = scopeOverride ?? fileToScope(filePath)
  const memories = queryMemories(db, {
    scopes: [scope, 'general'],
    types: [...ENFORCEMENT_TYPES],
    excludeInvalidated: true,
  })

  const ranked = rankMemories(memories, [scope])

  const violations = ranked
    .filter(m => m.type !== 'decision' && (m._score ?? 0) >= config.blockThreshold)
    .map(m => m.content)

  const warnings = ranked
    .filter(m =>
      (m._score ?? 0) >= config.warnThreshold &&
      (m.type === 'decision' || (m._score ?? 0) < config.blockThreshold),
    )
    .map(m => m.content)

  return { scope, violations, warnings, memories_checked: memories.length }
}
