import Database from 'better-sqlite3'
import { getActiveWorktrees, getFileConflicts, pruneStale } from '../../db/worktrees.js'
import { getActiveTask } from '../../db/tasks.js'

export interface WorktreeEntry {
  worktree: string
  task_title: string | null
  task_goal: string | null
  active_files: string[]
  age_seconds: number
}

export interface WorktreeStatusResult {
  active_worktrees: WorktreeEntry[]
  file_conflicts: string[]
}

interface GetWorktreeStatusParams {
  worktree?: string
}

export async function handleGetWorktreeStatus(
  db: Database.Database,
  params: GetWorktreeStatusParams,
): Promise<WorktreeStatusResult> {
  const currentWorktree = params.worktree ?? process.cwd()

  pruneStale(db)

  const allWorktrees = getActiveWorktrees(db)
  const others = allWorktrees.filter(w => w.worktree !== currentWorktree)

  const now = Date.now()
  const active_worktrees: WorktreeEntry[] = others.map(w => {
    const taskResult = w.task_id ? getActiveTask(db, w.worktree) : null
    return {
      worktree: w.worktree,
      task_title: taskResult?.task.title ?? null,
      task_goal: taskResult?.task.goal ?? null,
      active_files: w.active_files,
      age_seconds: Math.floor((now - new Date(w.last_heartbeat).getTime()) / 1000),
    }
  })

  const currentTask = getActiveTask(db, currentWorktree)
  const currentKeyFiles = currentTask?.state?.key_files ?? []
  const file_conflicts = getFileConflicts(db, currentWorktree, currentKeyFiles)

  return { active_worktrees, file_conflicts }
}
