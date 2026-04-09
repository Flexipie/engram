// ── Core domain types ────────────────────────────────────────────────────────

export type MemoryType = 'convention' | 'decision' | 'anti_pattern' | 'snippet' | 'error_pattern'
export type MemorySource = 'agent' | 'manual' | 'observer'

export interface Memory {
  id: string
  type: MemoryType
  scope: string
  content: string
  confidence: number
  source: MemorySource
  evidence_count: number
  invalidated: number
  invalidation_reason: string | null
  last_validated: string | null
  created_at: string
  updated_at: string
}

export interface GlobalMemory extends Memory {
  project_origin: string
  project_hint: string
}

export interface ContextPacket {
  critical: Memory[]
  relevant: Memory[]
  antipatterns: Memory[]
  global: GlobalMemory[]
  total_count: number
  scopes_available: string[]
}

export interface ContradictionWarning {
  id: string
  content: string
  similarity: number
}

// ── Task / session types ─────────────────────────────────────────────────────

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

export interface WorktreeActivity {
  worktree: string
  task_id: string | null
  active_files: string[]
  last_heartbeat: string
}

export interface SessionStartResult {
  task: (Task & { state?: TaskState }) | null
  memories: ContextPacket
  worktree_conflicts: WorktreeActivity[]
  file_conflicts: string[]
  session_id: string
}

// ── Error types ──────────────────────────────────────────────────────────────

export interface ErrorPattern {
  id: string
  signature: string
  error_raw: string
  error_normalized: string
  cause: string | null
  fix: string | null
  scope: string
  recurrence: number
  last_seen: string
  created_at: string
}

export type CheckErrorResult =
  | {
      found: true
      id: string
      signature: string
      cause: string | null
      fix: string | null
      recurrence: number
      scope: string
      last_seen: string
    }
  | { found: false; signature: string }

export interface RecordErrorResult {
  id: string
  signature: string
  recurrence: number
  updated: boolean
}

// ── Enforcement ──────────────────────────────────────────────────────────────

export interface EnforcementResult {
  scope: string
  violations: string[]
  warnings: string[]
  memories_checked: number
}

// ── Stats ────────────────────────────────────────────────────────────────────

export interface StatsResponse {
  tools: {
    session_start: { calls: number; task_hits: number }
    remember: { calls: number }
    recall: { calls: number; memories_returned: number }
    check_error: { calls: number; hits: number }
    record_error: { calls: number }
    invalidate: { calls: number }
    update_task: { calls: number }
    get_worktree_status: { calls: number }
    check_conventions: { calls: number }
  }
  enforcement: {
    checks: number
    violations: number
    warnings: number
  }
}

// ── Input types ──────────────────────────────────────────────────────────────

export interface RememberInput {
  content: string
  type: MemoryType
  scope: string
  source?: MemorySource
  global?: boolean
  worktree?: string
}

export interface RecallInput {
  scopes?: string[]
  types?: MemoryType[]
  query?: string
  include_global?: boolean
  limit?: number
  worktree?: string
}

export interface UpdateTaskInput {
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

export interface GetMemoriesInput {
  scope?: string
  type?: MemoryType
  query?: string
  minConfidence?: number
  limit?: number
  worktree?: string
}

export interface EngramClientOptions {
  /** Base URL of the Engram server. Defaults to `http://localhost:7337`. */
  baseUrl?: string
  /** Bearer token for authenticated servers. */
  apiKey?: string
  /** Default worktree path sent with every request. Defaults to `process.cwd()`. */
  worktree?: string
}
