import Database from 'better-sqlite3'
import { join } from 'path'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import chalk from 'chalk'
import type { Memory } from '../../db/memories.js'
import type { ErrorPattern } from '../../db/errors.js'

export interface ExportData {
  version: '1.0'
  exported_at: string
  project_dir: string
  domain: string
  memories: Memory[]
  error_patterns: ErrorPattern[]
  active_task: null
}

export interface ExportOptions {
  domain: string
  projectDir: string
}

export interface ImportOptions {
  replace: boolean
}

export interface ImportResult {
  imported: number
  skipped: number
}

export function exportData(db: Database.Database, opts: ExportOptions): ExportData {
  const memories = db.prepare('SELECT * FROM memories WHERE invalidated = 0').all() as Memory[]
  const errorPatterns = db.prepare('SELECT * FROM error_patterns').all() as ErrorPattern[]

  return {
    version: '1.0',
    exported_at: new Date().toISOString(),
    project_dir: opts.projectDir,
    domain: opts.domain,
    memories,
    error_patterns: errorPatterns,
    active_task: null,
  }
}

export function importData(db: Database.Database, data: ExportData, opts: ImportOptions): ImportResult {
  if (data.version !== '1.0') {
    throw new Error(`Unsupported export version: ${data.version}`)
  }

  const result: ImportResult = { imported: 0, skipped: 0 }

  db.transaction(() => {
    if (opts.replace) {
      db.prepare('DELETE FROM memories').run()
    }

    const existingContents = new Set<string>(
      (db.prepare('SELECT content FROM memories').all() as { content: string }[]).map(r => r.content),
    )

    for (const memory of data.memories) {
      if (!opts.replace && existingContents.has(memory.content)) {
        result.skipped++
        continue
      }
      const now = new Date().toISOString()
      db.prepare(`
        INSERT INTO memories (id, type, scope, content, confidence, source, evidence_count, invalidated, invalidation_reason, last_validated, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, ?, ?)
      `).run(
        memory.id,
        memory.type,
        memory.scope,
        memory.content,
        memory.confidence,
        memory.source,
        memory.evidence_count,
        memory.created_at,
        now,
      )
      result.imported++
    }
  })()

  return result
}

export async function runExportCommand(
  projectDir: string = process.cwd(),
  opts: { output?: string; json?: boolean } = {},
): Promise<void> {
  const dbPath = join(projectDir, '.engram', 'project.db')
  if (!existsSync(dbPath)) {
    console.error(chalk.red('No .engram/project.db found. Run `engram init` first.'))
    process.exit(1)
  }

  const db = new Database(dbPath, { readonly: true })

  let domain = 'software'
  const configPath = join(projectDir, '.engram', 'config.json')
  if (existsSync(configPath)) {
    try {
      const cfg = JSON.parse(readFileSync(configPath, 'utf-8')) as { domain?: string }
      domain = cfg.domain ?? 'software'
    } catch { /* ignore */ }
  }

  const data = exportData(db, { domain, projectDir })
  db.close()

  const json = JSON.stringify(data, null, 2)

  if (opts.json) {
    process.stdout.write(json + '\n')
    return
  }

  const outputPath = opts.output ?? join(projectDir, '.engram', `export-${Date.now()}.json`)
  writeFileSync(outputPath, json, 'utf-8')
  console.log(chalk.green(`Exported ${data.memories.length} memories to ${outputPath}`))
}

export async function runImportCommand(
  filePath: string,
  projectDir: string = process.cwd(),
  opts: { replace?: boolean } = {},
): Promise<void> {
  if (!existsSync(filePath)) {
    console.error(chalk.red(`File not found: ${filePath}`))
    process.exit(1)
  }

  const dbPath = join(projectDir, '.engram', 'project.db')
  if (!existsSync(dbPath)) {
    console.error(chalk.red('No .engram/project.db found. Run `engram init` first.'))
    process.exit(1)
  }

  let data: ExportData
  try {
    data = JSON.parse(readFileSync(filePath, 'utf-8')) as ExportData
  } catch {
    console.error(chalk.red('Failed to parse export file'))
    process.exit(1)
  }

  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')

  const result = importData(db, data, { replace: opts.replace ?? false })
  db.close()

  console.log(chalk.green(`Imported: ${result.imported}  Skipped (duplicate): ${result.skipped}`))
}
