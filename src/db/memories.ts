import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import { SOFTWARE_SCOPES } from '../domain/profiles.js'

export const MEMORY_TYPES = ['convention', 'decision', 'anti_pattern', 'snippet', 'error_pattern'] as const
export type MemoryType = typeof MEMORY_TYPES[number]

// MEMORY_SCOPES re-exports the software scopes for backward compatibility.
// Use getActiveScopes() from domain/active-profile.ts for runtime validation.
export const MEMORY_SCOPES = SOFTWARE_SCOPES
export type MemoryScope = string

export interface Memory {
  id: string
  type: MemoryType
  scope: string
  content: string
  confidence: number
  source: string
  evidence_count: number
  invalidated: number
  invalidation_reason: string | null
  last_validated: string | null
  created_at: string
  updated_at: string
  effective_confidence?: number
}

export interface GlobalMemory extends Memory {
  project_origin: string
  project_hint: string
}

export interface InsertMemoryData {
  type: MemoryType
  scope: string
  content: string
  confidence?: number
  source?: string
}

export interface MemoryWithEmbedding extends Memory {
  embedding: Buffer | null
}

export interface QueryMemoriesOpts {
  scopes?: string[]
  types?: string[]
  query?: string
  excludeInvalidated?: boolean
  minConfidence?: number
}

function sanitizeFtsQuery(q: string): string {
  return q.replace(/['"*^():.]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function insertMemory(db: Database.Database, data: InsertMemoryData, embedding?: Buffer): string {
  const id = uuidv4()
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO memories (id, type, scope, content, confidence, source, evidence_count, invalidated, created_at, updated_at, embedding)
    VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?)
  `).run(id, data.type, data.scope, data.content, data.confidence ?? 0.5, data.source ?? 'agent', now, now, embedding ?? null)
  return id
}

export function updateMemoryEmbedding(db: Database.Database, id: string, embedding: Buffer): void {
  db.prepare('UPDATE memories SET embedding = ? WHERE id = ?').run(embedding, id)
}

export function queryMemoriesWithEmbeddings(db: Database.Database, opts: QueryMemoriesOpts = {}): MemoryWithEmbedding[] {
  const { scopes, types, query, excludeInvalidated = true, minConfidence } = opts

  if (query) {
    const sanitized = sanitizeFtsQuery(query)
    if (sanitized) {
      try {
        return runMemoryQueryWithEmbeddings(db, { scopes, types, excludeInvalidated, minConfidence, ftsQuery: sanitized })
      } catch {
        return runMemoryQueryWithEmbeddings(db, { scopes, types, excludeInvalidated, minConfidence, likeQuery: query })
      }
    }
  }

  return runMemoryQueryWithEmbeddings(db, { scopes, types, excludeInvalidated, minConfidence })
}

function runMemoryQueryWithEmbeddings(db: Database.Database, opts: RunQueryOpts): MemoryWithEmbedding[] {
  const { scopes, types, excludeInvalidated, minConfidence, ftsQuery, likeQuery } = opts
  const conditions: string[] = []
  const params: (string | number)[] = []

  if (ftsQuery) {
    conditions.push('m.rowid IN (SELECT rowid FROM memories_fts WHERE memories_fts MATCH ?)')
    params.push(ftsQuery)
  } else if (likeQuery) {
    conditions.push('m.content LIKE ?')
    params.push(`%${likeQuery}%`)
  }

  if (scopes && scopes.length > 0) {
    conditions.push(`m.scope IN (${scopes.map(() => '?').join(',')})`)
    params.push(...scopes)
  }

  if (types && types.length > 0) {
    conditions.push(`m.type IN (${types.map(() => '?').join(',')})`)
    params.push(...types)
  }

  if (excludeInvalidated) {
    conditions.push('m.invalidated = 0')
  }

  if (minConfidence !== undefined) {
    conditions.push('m.confidence >= ?')
    params.push(minConfidence)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const sql = `SELECT m.*, m.embedding FROM memories m ${where} ORDER BY m.confidence DESC`
  return db.prepare(sql).all(...params) as MemoryWithEmbedding[]
}

interface RunQueryOpts {
  scopes?: string[]
  types?: string[]
  excludeInvalidated?: boolean
  minConfidence?: number
  ftsQuery?: string
  likeQuery?: string
}

function runMemoryQuery(db: Database.Database, opts: RunQueryOpts): Memory[] {
  const { scopes, types, excludeInvalidated, minConfidence, ftsQuery, likeQuery } = opts
  const conditions: string[] = []
  const params: (string | number)[] = []

  if (ftsQuery) {
    conditions.push('m.rowid IN (SELECT rowid FROM memories_fts WHERE memories_fts MATCH ?)')
    params.push(ftsQuery)
  } else if (likeQuery) {
    conditions.push('m.content LIKE ?')
    params.push(`%${likeQuery}%`)
  }

  if (scopes && scopes.length > 0) {
    conditions.push(`m.scope IN (${scopes.map(() => '?').join(',')})`)
    params.push(...scopes)
  }

  if (types && types.length > 0) {
    conditions.push(`m.type IN (${types.map(() => '?').join(',')})`)
    params.push(...types)
  }

  if (excludeInvalidated) {
    conditions.push('m.invalidated = 0')
  }

  if (minConfidence !== undefined) {
    conditions.push('m.confidence >= ?')
    params.push(minConfidence)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const sql = `SELECT m.* FROM memories m ${where} ORDER BY m.confidence DESC`
  return db.prepare(sql).all(...params) as Memory[]
}

export function queryMemories(db: Database.Database, opts: QueryMemoriesOpts = {}): Memory[] {
  const { scopes, types, query, excludeInvalidated = true, minConfidence } = opts

  if (query) {
    const sanitized = sanitizeFtsQuery(query)
    if (sanitized) {
      try {
        return runMemoryQuery(db, { scopes, types, excludeInvalidated, minConfidence, ftsQuery: sanitized })
      } catch {
        return runMemoryQuery(db, { scopes, types, excludeInvalidated, minConfidence, likeQuery: query })
      }
    }
  }

  return runMemoryQuery(db, { scopes, types, excludeInvalidated, minConfidence })
}

export function invalidateMemory(db: Database.Database, id: string, reason?: string): boolean {
  const now = new Date().toISOString()
  const result = db.prepare(`
    UPDATE memories SET invalidated = 1, invalidation_reason = ?, updated_at = ? WHERE id = ?
  `).run(reason ?? null, now, id)
  return result.changes > 0
}

export function getMemoryById(db: Database.Database, id: string): Memory | null {
  return (db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as Memory | undefined) ?? null
}

export function boostConfidence(db: Database.Database, id: string, delta: number): void {
  db.prepare(`
    UPDATE memories SET confidence = MIN(1.0, confidence + ?), updated_at = ? WHERE id = ?
  `).run(delta, new Date().toISOString(), id)
}

export function decreaseConfidence(db: Database.Database, id: string, delta: number): void {
  db.prepare(`
    UPDATE memories SET confidence = MAX(0.0, confidence - ?), updated_at = ? WHERE id = ?
  `).run(delta, new Date().toISOString(), id)
}
