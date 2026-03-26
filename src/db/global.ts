import Database from 'better-sqlite3'
import { mkdirSync, existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '../logger.js'
import type { GlobalMemory, MemoryType, MemoryScope, QueryMemoriesOpts } from './memories.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function globalDbPath(): string {
  return join(homedir(), '.engram', 'global.db')
}

function loadGlobalMigrationSql(): string {
  const filePath = join(__dirname, 'migrations', '0003_global.sql')
  return readFileSync(filePath, 'utf-8')
}

function applyGlobalMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `)

  const existing = db.prepare('SELECT version FROM _schema_version WHERE version = ?').get(1)
  if (existing) return

  const sql = loadGlobalMigrationSql()
  // Remove standalone _schema_version CREATE TABLE — already created above
  const cleanedSql = sql.replace(/CREATE TABLE IF NOT EXISTS _schema_version[\s\S]*?;/, '')

  const apply = db.transaction(() => {
    db.exec(cleanedSql)
    db.prepare('INSERT INTO _schema_version (version, applied_at) VALUES (?, ?)').run(
      1,
      new Date().toISOString(),
    )
  })
  apply()
  logger.info('Global DB migrations applied')
}

export function openGlobalDb(): Database.Database {
  const engramDir = join(homedir(), '.engram')
  if (!existsSync(engramDir)) {
    mkdirSync(engramDir, { recursive: true })
  }

  const dbPath = globalDbPath()
  const db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')

  applyGlobalMigrations(db)

  logger.info(`Global DB opened at ${dbPath}`)
  return db
}

export interface InsertGlobalMemoryData {
  type: MemoryType
  scope: MemoryScope
  content: string
  confidence?: number
  source?: string
  project_origin: string
  project_hint?: string
}

export function insertGlobalMemory(db: Database.Database, data: InsertGlobalMemoryData): string {
  const id = uuidv4()
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO global_memories (id, type, scope, content, confidence, source, evidence_count, invalidated, project_origin, project_hint, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?)
  `).run(
    id,
    data.type,
    data.scope,
    data.content,
    data.confidence ?? 0.5,
    data.source ?? 'agent',
    data.project_origin,
    data.project_hint ?? '',
    now,
    now,
  )
  return id
}

function sanitizeFtsQuery(q: string): string {
  return q.replace(/['"*^():.]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function queryGlobalMemories(
  db: Database.Database,
  opts: QueryMemoriesOpts & { projectHint?: string } = {},
): GlobalMemory[] {
  const { scopes, types, query, excludeInvalidated = true, minConfidence, projectHint } = opts
  const conditions: string[] = []
  const params: (string | number)[] = []

  if (query) {
    const sanitized = sanitizeFtsQuery(query)
    if (sanitized) {
      try {
        conditions.push(
          'm.rowid IN (SELECT rowid FROM global_memories_fts WHERE global_memories_fts MATCH ?)',
        )
        params.push(sanitized)
      } catch {
        conditions.push('m.content LIKE ?')
        params.push(`%${query}%`)
      }
    }
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

  if (projectHint) {
    conditions.push('m.project_hint LIKE ?')
    params.push(`%${projectHint}%`)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const sql = `SELECT m.* FROM global_memories m ${where} ORDER BY m.confidence DESC`
  return db.prepare(sql).all(...params) as GlobalMemory[]
}
