export interface ToolStats {
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

export const toolStats: ToolStats = {
  session_start: { calls: 0, task_hits: 0 },
  remember: { calls: 0 },
  recall: { calls: 0, memories_returned: 0 },
  check_error: { calls: 0, hits: 0 },
  record_error: { calls: 0 },
  invalidate: { calls: 0 },
  update_task: { calls: 0 },
  get_worktree_status: { calls: 0 },
  check_conventions: { calls: 0 },
}
