import Database from 'better-sqlite3'
import { applyMigrations } from '../db/connection.js'
import { DbPool } from '../db/pool.js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  applyMigrations(db)
  return db
}

export function createTestGlobalDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')

  db.exec(`
    CREATE TABLE IF NOT EXISTS _schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `)

  const existing = db.prepare('SELECT version FROM _schema_version WHERE version = ?').get(1)
  if (!existing) {
    const sqlPath = join(__dirname, '../db/migrations/0003_global.sql')
    let sql = readFileSync(sqlPath, 'utf-8')
    sql = sql.replace(/CREATE TABLE IF NOT EXISTS _schema_version[\s\S]*?;/, '')
    const apply = db.transaction(() => {
      db.exec(sql)
      db.prepare('INSERT INTO _schema_version (version, applied_at) VALUES (?, ?)').run(
        1,
        new Date().toISOString(),
      )
    })
    apply()
  }

  return db
}

export function teardownDb(db: Database.Database): void {
  db.close()
}

/**
 * Create a DbPool that routes all worktree paths to the given in-memory test DB.
 * All get() and resolve() calls return the same test DB regardless of path.
 */
export function createTestPool(db: Database.Database): DbPool {
  const pool = new DbPool(null)
  // Pre-load a default path so resolve() without args works
  const DEFAULT = '/test/worktree'
  pool.set(DEFAULT, db)
  // Override get() so any path returns the test DB
  pool.get = (_path: string) => {
    pool.set(_path, db)
    return db
  }
  // Override resolve() so it always returns the test DB
  pool.resolve = (_worktree?: string) => db
  return pool
}
