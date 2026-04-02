import Database from 'better-sqlite3'
import { join } from 'path'
import { appendFileSync, mkdirSync, existsSync } from 'fs'
import chalk from 'chalk'

export interface GcResult {
  memoriesArchived: number
  snapshotsPruned: number
  tasksArchived: number
}

export function runGc(db: Database.Database): GcResult {
  const result: GcResult = { memoriesArchived: 0, snapshotsPruned: 0, tasksArchived: 0 }
  const now = new Date().toISOString()

  db.transaction(() => {
    // 1. Archive memories with confidence < 0.2
    const archiveMemories = db.prepare(`
      UPDATE memories
      SET invalidated = 1, invalidation_reason = 'gc: confidence below threshold', updated_at = ?
      WHERE confidence < 0.2 AND invalidated = 0
    `)
    const memResult = archiveMemories.run(now)
    result.memoriesArchived = memResult.changes

    // 2. Prune snapshots: for each task_id, keep the 3 most recent by created_at
    const taskIds = db.prepare('SELECT DISTINCT task_id FROM snapshots').all() as { task_id: string }[]
    for (const { task_id } of taskIds) {
      const keep = db.prepare(
        `SELECT id FROM snapshots WHERE task_id = ? ORDER BY created_at DESC LIMIT 3`,
      ).all(task_id) as { id: string }[]
      const keepIds = keep.map(r => r.id)
      if (keepIds.length === 0) continue
      const placeholders = keepIds.map(() => '?').join(',')
      const pruneResult = db.prepare(
        `DELETE FROM snapshots WHERE task_id = ? AND id NOT IN (${placeholders})`,
      ).run(task_id, ...keepIds)
      result.snapshotsPruned += pruneResult.changes
    }

    // 3. Archive tasks with status='paused' and updated_at < 60 days ago
    const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
    const archiveTasks = db.prepare(`
      UPDATE tasks SET status = 'archived', archived_at = ?
      WHERE status = 'paused' AND updated_at < ?
    `)
    const taskResult = archiveTasks.run(now, cutoff)
    result.tasksArchived = taskResult.changes
  })()

  return result
}

export async function runGcCommand(projectDir: string = process.cwd()): Promise<void> {
  const dbPath = join(projectDir, '.engram', 'project.db')
  if (!existsSync(dbPath)) {
    console.error(chalk.red('No .engram/project.db found. Run `engram init` first.'))
    process.exit(1)
  }

  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')

  console.log(chalk.bold('\nEngram GC\n'))

  const result = runGc(db)
  db.close()

  console.log(chalk.green(`  Memories archived: ${result.memoriesArchived}`))
  console.log(chalk.green(`  Snapshots pruned:  ${result.snapshotsPruned}`))
  console.log(chalk.green(`  Tasks archived:    ${result.tasksArchived}`))

  // Append to gc.log
  const logPath = join(projectDir, '.engram', 'gc.log')
  const logEntry = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...result,
  }) + '\n'
  mkdirSync(join(projectDir, '.engram'), { recursive: true })
  appendFileSync(logPath, logEntry, 'utf-8')
  console.log(chalk.gray(`  Appended to .engram/gc.log`))
}
