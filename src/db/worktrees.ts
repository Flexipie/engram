import Database from 'better-sqlite3'

export interface WorktreeActivity {
  worktree: string
  task_id: string | null
  active_files: string[]
  last_heartbeat: string
}

interface WorktreeActivityRow {
  worktree: string
  task_id: string | null
  active_files: string
  last_heartbeat: string
}

function parseRow(row: WorktreeActivityRow): WorktreeActivity {
  return {
    worktree: row.worktree,
    task_id: row.task_id,
    active_files: JSON.parse(row.active_files) as string[],
    last_heartbeat: row.last_heartbeat,
  }
}

export function upsertWorktreeActivity(
  db: Database.Database,
  worktree: string,
  taskId?: string,
  activeFiles?: string[],
): void {
  const now = new Date().toISOString()
  const filesJson = JSON.stringify(activeFiles ?? [])

  const existing = db
    .prepare(`SELECT worktree FROM worktree_activity WHERE worktree = ?`)
    .get(worktree)

  if (existing) {
    const updates: string[] = ['last_heartbeat = ?']
    const values: unknown[] = [now]

    if (taskId !== undefined) {
      updates.push('task_id = ?')
      values.push(taskId)
    }
    if (activeFiles !== undefined) {
      updates.push('active_files = ?')
      values.push(filesJson)
    }

    values.push(worktree)
    db.prepare(`UPDATE worktree_activity SET ${updates.join(', ')} WHERE worktree = ?`).run(
      ...values,
    )
  } else {
    db.prepare(
      `INSERT INTO worktree_activity (worktree, task_id, active_files, last_heartbeat) VALUES (?, ?, ?, ?)`,
    ).run(worktree, taskId ?? null, filesJson, now)
  }
}

export function getActiveWorktrees(db: Database.Database): WorktreeActivity[] {
  const rows = db
    .prepare(
      `SELECT worktree, task_id, active_files, last_heartbeat FROM worktree_activity ORDER BY last_heartbeat DESC`,
    )
    .all() as WorktreeActivityRow[]

  return rows.map(parseRow)
}

export function pruneStale(db: Database.Database, maxAgeMs = 10 * 60 * 1000): void {
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString()
  db.prepare(`DELETE FROM worktree_activity WHERE last_heartbeat < ?`).run(cutoff)
}
