import Database from 'better-sqlite3'
import { mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { logger } from '../logger.js'
import sql0001 from './migrations/0001_init.sql'
import sql0002 from './migrations/0002_memories.sql'
import sql0004 from './migrations/0004_errors.sql'
import sql0005 from './migrations/0005_embeddings.sql'

const MIGRATIONS: Array<{ version: number; sql: string }> = [
  { version: 1, sql: sql0001 },
  { version: 2, sql: sql0002 },
  { version: 3, sql: sql0004 },
  { version: 4, sql: sql0005 },
]

export function applyMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `)

  for (const migration of MIGRATIONS) {
    const existing = db
      .prepare('SELECT version FROM _schema_version WHERE version = ?')
      .get(migration.version)

    if (existing) {
      logger.debug(`Migration ${migration.version} already applied, skipping`)
      continue
    }

    logger.info(`Applying migration ${migration.version}`)

    const cleanedSql = migration.sql.replace(
      /CREATE TABLE(?: IF NOT EXISTS)? _schema_version[\s\S]*?;/,
      '',
    )

    const applyMigration = db.transaction(() => {
      db.exec(cleanedSql)
      db.prepare('INSERT INTO _schema_version (version, applied_at) VALUES (?, ?)').run(
        migration.version,
        new Date().toISOString(),
      )
    })

    applyMigration()
    logger.info(`Migration ${migration.version} applied successfully`)
  }
}

export function openProjectDb(projectDir: string): Database.Database {
  const engramDir = join(projectDir, '.engram')
  if (!existsSync(engramDir)) {
    mkdirSync(engramDir, { recursive: true })
  }

  const dbPath = join(engramDir, 'project.db')
  const db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')

  applyMigrations(db)

  logger.info(`Database opened at ${dbPath}`)
  return db
}
