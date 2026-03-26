import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import {
  getActiveTask,
  upsertTask,
  upsertTaskState,
  type Task,
  type TaskState,
} from '../../db/tasks.js'
import { getActiveWorktrees, pruneStale, upsertWorktreeActivity } from '../../db/worktrees.js'
import type { WorktreeActivity } from '../../db/worktrees.js'

interface MemoriesPacket {
  critical: unknown[]
  relevant: unknown[]
  antipatterns: unknown[]
  global: unknown[]
  total_count: number
  scopes_available: string[]
}

interface SessionStartParams {
  worktree?: string
  context_hint?: string
}

interface SessionStartResult {
  task: (Task & { state?: TaskState }) | null
  memories: MemoriesPacket
  worktree_conflicts: WorktreeActivity[]
  session_id: string
}

interface UpdateTaskParams {
  worktree?: string
  title?: string
  goal?: string
  summary?: string
  completed?: string[]
  in_progress?: string
  next_steps?: string[]
  key_files?: string[]
  constraints?: string[]
  decisions?: string[]
}

interface UpdateTaskResult {
  task_id: string
}

const EMPTY_MEMORIES: MemoriesPacket = {
  critical: [],
  relevant: [],
  antipatterns: [],
  global: [],
  total_count: 0,
  scopes_available: [],
}

export async function handleSessionStart(
  db: Database.Database,
  params: SessionStartParams,
): Promise<SessionStartResult> {
  const worktree = params.worktree ?? process.cwd()
  const sessionId = uuidv4()

  // Prune stale worktree activity (>10 min)
  pruneStale(db)

  // Get active task for this worktree
  const taskResult = getActiveTask(db, worktree)

  // Update worktree activity
  upsertWorktreeActivity(db, worktree, taskResult?.task.id)

  // Get active worktrees for conflict detection
  const activeWorktrees = getActiveWorktrees(db)
  const worktreeConflicts = activeWorktrees.filter((w) => w.worktree !== worktree)

  if (taskResult) {
    const { task, state } = taskResult
    task.state = state
    return {
      task,
      memories: EMPTY_MEMORIES,
      worktree_conflicts: worktreeConflicts,
      session_id: sessionId,
    }
  }

  return {
    task: null,
    memories: EMPTY_MEMORIES,
    worktree_conflicts: worktreeConflicts,
    session_id: sessionId,
  }
}

export async function handleUpdateTask(
  db: Database.Database,
  params: UpdateTaskParams,
): Promise<UpdateTaskResult> {
  const worktree = params.worktree ?? process.cwd()
  const sessionId = uuidv4()

  const taskId = upsertTask(
    db,
    worktree,
    {
      title: params.title,
      goal: params.goal,
    },
    sessionId,
  )

  // Update task state with any provided state fields
  const hasStateUpdate =
    params.summary !== undefined ||
    params.completed !== undefined ||
    params.in_progress !== undefined ||
    params.next_steps !== undefined ||
    params.key_files !== undefined ||
    params.constraints !== undefined ||
    params.decisions !== undefined

  if (hasStateUpdate) {
    upsertTaskState(
      db,
      taskId,
      {
        summary: params.summary,
        completed: params.completed,
        in_progress: params.in_progress,
        next_steps: params.next_steps,
        key_files: params.key_files,
        constraints: params.constraints,
        decisions: params.decisions,
      },
      sessionId,
    )
  }

  // Update worktree activity
  upsertWorktreeActivity(db, worktree, taskId)

  return { task_id: taskId }
}
