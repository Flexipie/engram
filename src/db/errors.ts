import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'

export interface ErrorPattern {
  id: string
  signature: string
  error_raw: string
  error_normalized: string
  cause: string | null
  fix: string | null
  scope: string
  recurrence: number
  last_seen: string
  created_at: string
}

export interface InsertErrorData {
  signature: string
  error_raw: string
  error_normalized: string
  cause?: string
  fix?: string
  scope: string
}

export interface UpsertErrorData {
  error_raw: string
  error_normalized: string
  cause?: string
  fix?: string
  scope: string
}

export function lookupBySignature(db: Database.Database, signature: string): ErrorPattern | null {
  return (
    (db.prepare('SELECT * FROM error_patterns WHERE signature = ?').get(signature) as ErrorPattern | undefined) ?? null
  )
}

export function insertErrorPattern(db: Database.Database, data: InsertErrorData): string {
  const id = uuidv4()
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO error_patterns (id, signature, error_raw, error_normalized, cause, fix, scope, recurrence, last_seen, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    id,
    data.signature,
    data.error_raw,
    data.error_normalized,
    data.cause ?? null,
    data.fix ?? null,
    data.scope,
    now,
    now,
  )
  return id
}

export function upsertErrorPattern(
  db: Database.Database,
  signature: string,
  data: UpsertErrorData,
): { id: string; updated: boolean } {
  const existing = lookupBySignature(db, signature)

  if (existing) {
    const now = new Date().toISOString()
    const newCause = data.cause && data.cause.length > 0 ? data.cause : existing.cause
    const newFix = data.fix && data.fix.length > 0 ? data.fix : existing.fix

    const doUpdate = db.transaction(() => {
      db.prepare(`
        UPDATE error_patterns
        SET cause = ?, fix = ?, recurrence = recurrence + 1, last_seen = ?
        WHERE signature = ?
      `).run(newCause, newFix, now, signature)
    })
    doUpdate()

    return { id: existing.id, updated: true }
  }

  const id = insertErrorPattern(db, { signature, ...data })
  return { id, updated: false }
}

export function incrementRecurrence(db: Database.Database, signature: string): void {
  const now = new Date().toISOString()
  db.prepare(`
    UPDATE error_patterns SET recurrence = recurrence + 1, last_seen = ? WHERE signature = ?
  `).run(now, signature)
}

export function listErrorPatterns(
  db: Database.Database,
  opts?: { scope?: string },
): ErrorPattern[] {
  if (opts?.scope) {
    return db
      .prepare('SELECT * FROM error_patterns WHERE scope = ? ORDER BY recurrence DESC, last_seen DESC')
      .all(opts.scope) as ErrorPattern[]
  }
  return db
    .prepare('SELECT * FROM error_patterns ORDER BY recurrence DESC, last_seen DESC')
    .all() as ErrorPattern[]
}
