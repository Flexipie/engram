import { describe, it, expect, beforeEach } from 'vitest'
import { toolStats } from '../../http/stats.js'

function resetStats(): void {
  toolStats.session_start.calls = 0
  toolStats.session_start.task_hits = 0
  toolStats.remember.calls = 0
  toolStats.recall.calls = 0
  toolStats.recall.memories_returned = 0
  toolStats.check_error.calls = 0
  toolStats.check_error.hits = 0
  toolStats.record_error.calls = 0
  toolStats.invalidate.calls = 0
  toolStats.update_task.calls = 0
  toolStats.get_worktree_status.calls = 0
  toolStats.check_conventions.calls = 0
}

describe('toolStats singleton', () => {
  beforeEach(() => {
    resetStats()
  })

  it('starts at zero', () => {
    expect(toolStats.session_start.calls).toBe(0)
    expect(toolStats.session_start.task_hits).toBe(0)
    expect(toolStats.remember.calls).toBe(0)
    expect(toolStats.recall.calls).toBe(0)
    expect(toolStats.recall.memories_returned).toBe(0)
    expect(toolStats.check_error.calls).toBe(0)
    expect(toolStats.check_error.hits).toBe(0)
    expect(toolStats.record_error.calls).toBe(0)
    expect(toolStats.invalidate.calls).toBe(0)
    expect(toolStats.update_task.calls).toBe(0)
    expect(toolStats.get_worktree_status.calls).toBe(0)
    expect(toolStats.check_conventions.calls).toBe(0)
  })

  it('increments session_start.calls', () => {
    toolStats.session_start.calls++
    toolStats.session_start.calls++
    expect(toolStats.session_start.calls).toBe(2)
  })

  it('increments session_start.task_hits only when task present', () => {
    toolStats.session_start.calls++
    // no task_hit
    toolStats.session_start.calls++
    toolStats.session_start.task_hits++
    expect(toolStats.session_start.calls).toBe(2)
    expect(toolStats.session_start.task_hits).toBe(1)
  })

  it('increments recall.memories_returned by result size', () => {
    toolStats.recall.calls++
    toolStats.recall.memories_returned += 3
    toolStats.recall.calls++
    toolStats.recall.memories_returned += 2
    expect(toolStats.recall.calls).toBe(2)
    expect(toolStats.recall.memories_returned).toBe(5)
  })

  it('increments check_error.hits only on found: true', () => {
    toolStats.check_error.calls++
    // miss — no hit increment
    toolStats.check_error.calls++
    toolStats.check_error.hits++
    expect(toolStats.check_error.calls).toBe(2)
    expect(toolStats.check_error.hits).toBe(1)
  })

  it('all counters are independent', () => {
    toolStats.remember.calls++
    toolStats.record_error.calls++
    toolStats.invalidate.calls++
    toolStats.update_task.calls++
    toolStats.get_worktree_status.calls++
    toolStats.check_conventions.calls++
    expect(toolStats.remember.calls).toBe(1)
    expect(toolStats.record_error.calls).toBe(1)
    expect(toolStats.invalidate.calls).toBe(1)
    expect(toolStats.update_task.calls).toBe(1)
    expect(toolStats.get_worktree_status.calls).toBe(1)
    expect(toolStats.check_conventions.calls).toBe(1)
    // others unchanged
    expect(toolStats.session_start.calls).toBe(0)
    expect(toolStats.recall.calls).toBe(0)
  })
})
