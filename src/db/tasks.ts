import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'

export interface Task {
  id: string
  worktree: string
  title: string
  goal: string
  status: string
  session_id: string | null
  started_at: string
  updated_at: string
  archived_at: string | null
  state?: TaskState
}

export interface TaskState {
  id: string
  task_id: string
  session_id: string | null
  summary: string | null
  completed: string[]
  in_progress: string | null
  next_steps: string[]
  key_files: string[]
  constraints: string[]
  decisions: string[]
  updated_at: string
}

export interface Snapshot {
  id: string
  task_id: string
  state_json: string
  trigger: string
  created_at: string
}

type TaskRow = Omit<Task, 'state' | 'completed' | 'in_progress' | 'next_steps' | 'key_files' | 'constraints' | 'decisions'>

interface TaskStateRow {
  id: string
  task_id: string
  session_id: string | null
  summary: string | null
  completed: string
  in_progress: string | null
  next_steps: string
  key_files: string
  constraints: string
  decisions: string
  updated_at: string
}

function parseTaskState(row: TaskStateRow): TaskState {
  return {
    id: row.id,
    task_id: row.task_id,
    session_id: row.session_id,
    summary: row.summary,
    completed: JSON.parse(row.completed) as string[],
    in_progress: row.in_progress,
    next_steps: JSON.parse(row.next_steps) as string[],
    key_files: JSON.parse(row.key_files) as string[],
    constraints: JSON.parse(row.constraints) as string[],
    decisions: JSON.parse(row.decisions) as string[],
    updated_at: row.updated_at,
  }
}

export function getActiveTask(
  db: Database.Database,
  worktree: string,
): { task: Task; state: TaskState } | null {
  const taskRow = db
    .prepare(
      `SELECT id, worktree, title, goal, status, session_id, started_at, updated_at, archived_at
       FROM tasks WHERE worktree = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1`,
    )
    .get(worktree) as TaskRow | undefined

  if (!taskRow) return null

  const stateRow = db
    .prepare(
      `SELECT id, task_id, session_id, summary, completed, in_progress, next_steps, key_files, constraints, decisions, updated_at
       FROM task_state WHERE task_id = ? ORDER BY updated_at DESC LIMIT 1`,
    )
    .get(taskRow.id) as TaskStateRow | undefined

  const task: Task = {
    id: taskRow.id,
    worktree: taskRow.worktree,
    title: taskRow.title,
    goal: taskRow.goal,
    status: taskRow.status,
    session_id: taskRow.session_id,
    started_at: taskRow.started_at,
    updated_at: taskRow.updated_at,
    archived_at: taskRow.archived_at,
  }

  if (stateRow) {
    const state = parseTaskState(stateRow)
    task.state = state
    return { task, state }
  }

  return { task, state: createEmptyState(taskRow.id) }
}

function createEmptyState(taskId: string): TaskState {
  return {
    id: uuidv4(),
    task_id: taskId,
    session_id: null,
    summary: null,
    completed: [],
    in_progress: null,
    next_steps: [],
    key_files: [],
    constraints: [],
    decisions: [],
    updated_at: new Date().toISOString(),
  }
}

export function upsertTask(
  db: Database.Database,
  worktree: string,
  data: Partial<Task> & { title?: string; goal?: string },
  sessionId: string,
): string {
  const now = new Date().toISOString()

  // Check for existing active task
  const existing = db
    .prepare(`SELECT id FROM tasks WHERE worktree = ? AND status = 'active' LIMIT 1`)
    .get(worktree) as { id: string } | undefined

  if (existing) {
    // Update existing task
    const updates: string[] = ['updated_at = ?', 'session_id = ?']
    const values: unknown[] = [now, sessionId]

    if (data.title !== undefined) {
      updates.push('title = ?')
      values.push(data.title)
    }
    if (data.goal !== undefined) {
      updates.push('goal = ?')
      values.push(data.goal)
    }

    values.push(existing.id)
    db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values)
    return existing.id
  }

  // Create new task
  const taskId = uuidv4()
  db.prepare(
    `INSERT INTO tasks (id, worktree, title, goal, status, session_id, started_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
  ).run(taskId, worktree, data.title ?? 'Untitled Task', data.goal ?? '', sessionId, now, now)

  return taskId
}

export function upsertTaskState(
  db: Database.Database,
  taskId: string,
  data: Partial<TaskState>,
  sessionId: string,
): void {
  const now = new Date().toISOString()

  const existing = db
    .prepare(`SELECT id, completed, next_steps, key_files, constraints, decisions FROM task_state WHERE task_id = ? LIMIT 1`)
    .get(taskId) as TaskStateRow | undefined

  if (existing) {
    const updates: string[] = ['updated_at = ?', 'session_id = ?']
    const values: unknown[] = [now, sessionId]

    if (data.summary !== undefined) {
      updates.push('summary = ?')
      values.push(data.summary)
    }
    if (data.in_progress !== undefined) {
      updates.push('in_progress = ?')
      values.push(data.in_progress)
    }
    if (data.completed !== undefined) {
      updates.push('completed = ?')
      values.push(JSON.stringify(data.completed))
    }
    if (data.next_steps !== undefined) {
      updates.push('next_steps = ?')
      values.push(JSON.stringify(data.next_steps))
    }
    if (data.key_files !== undefined) {
      updates.push('key_files = ?')
      values.push(JSON.stringify(data.key_files))
    }
    if (data.constraints !== undefined) {
      updates.push('constraints = ?')
      values.push(JSON.stringify(data.constraints))
    }
    if (data.decisions !== undefined) {
      updates.push('decisions = ?')
      values.push(JSON.stringify(data.decisions))
    }

    values.push(existing.id)
    db.prepare(`UPDATE task_state SET ${updates.join(', ')} WHERE id = ?`).run(...values)
  } else {
    const stateId = uuidv4()
    db.prepare(
      `INSERT INTO task_state (id, task_id, session_id, summary, completed, in_progress, next_steps, key_files, constraints, decisions, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      stateId,
      taskId,
      sessionId,
      data.summary ?? null,
      JSON.stringify(data.completed ?? []),
      data.in_progress ?? null,
      JSON.stringify(data.next_steps ?? []),
      JSON.stringify(data.key_files ?? []),
      JSON.stringify(data.constraints ?? []),
      JSON.stringify(data.decisions ?? []),
      now,
    )
  }
}

export function createSnapshot(
  db: Database.Database,
  taskId: string,
  trigger: string,
): string {
  const now = new Date().toISOString()
  const snapshotId = uuidv4()

  const stateRow = db
    .prepare(
      `SELECT id, task_id, session_id, summary, completed, in_progress, next_steps, key_files, constraints, decisions, updated_at
       FROM task_state WHERE task_id = ? ORDER BY updated_at DESC LIMIT 1`,
    )
    .get(taskId) as TaskStateRow | undefined

  const stateJson = stateRow ? JSON.stringify(parseTaskState(stateRow)) : JSON.stringify({})

  db.prepare(
    `INSERT INTO snapshots (id, task_id, state_json, trigger, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(snapshotId, taskId, stateJson, trigger, now)

  return snapshotId
}

export function getLatestSnapshot(db: Database.Database, taskId: string): Snapshot | null {
  const row = db
    .prepare(
      `SELECT id, task_id, state_json, trigger, created_at FROM snapshots WHERE task_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(taskId) as Snapshot | undefined

  return row ?? null
}
