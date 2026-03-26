import Database from 'better-sqlite3'
import { applyMigrations } from '../db/connection.js'

export function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  applyMigrations(db)
  return db
}

export function teardownDb(db: Database.Database): void {
  db.close()
}
