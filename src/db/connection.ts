import Database from 'better-sqlite3'
import { mkdirSync, existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { logger } from '../logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Migration SQL — loaded as text by tsup's .sql loader
// For dev/test environments, read from filesystem
function loadMigrationSql(filename: string): string {
  const filePath = join(__dirname, 'migrations', filename)
  return readFileSync(filePath, 'utf-8')
}

const MIGRATIONS: Array<{ version: number; filename: string }> = [
  { version: 1, filename: '0001_init.sql' },
  { version: 2, filename: '0002_memories.sql' },
  { version: 3, filename: '0004_errors.sql' },
]

export function applyMigrations(db: Database.Database): void {
  // Ensure _schema_version table exists (may not exist on first run before migration)
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

    logger.info(`Applying migration ${migration.version}: ${migration.filename}`)

    let sql: string
    try {
      sql = loadMigrationSql(migration.filename)
    } catch (err) {
      // In bundled mode, SQL is inlined — try import fallback
      throw new Error(
        `Failed to load migration ${migration.filename}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    // Remove the _schema_version CREATE TABLE from migration SQL since we already created it
    const cleanedSql = sql.replace(
      /CREATE TABLE _schema_version[\s\S]*?;/,
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
