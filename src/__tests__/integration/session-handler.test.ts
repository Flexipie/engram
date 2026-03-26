import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, teardownDb } from '../setup.js'
import { handleSessionStart, handleUpdateTask } from '../../mcp/handlers/session.js'
import type Database from 'better-sqlite3'

const TEST_WORKTREE = '/test/worktree'

describe('session_start handler', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    teardownDb(db)
  })

  it('returns null task for new worktree', async () => {
    const result = await handleSessionStart(db, { worktree: TEST_WORKTREE })
    expect(result.task).toBeNull()
  })

  it('returns a valid session_id', async () => {
    const result = await handleSessionStart(db, { worktree: TEST_WORKTREE })
    expect(result.session_id).toBeDefined()
    // UUID v4 format
    expect(result.session_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })

  it('returns empty memories packet', async () => {
    const result = await handleSessionStart(db, { worktree: TEST_WORKTREE })
    expect(result.memories).toBeDefined()
    expect(result.memories.critical).toEqual([])
    expect(result.memories.relevant).toEqual([])
    expect(result.memories.antipatterns).toEqual([])
    expect(result.memories.global).toEqual([])
    expect(result.memories.total_count).toBe(0)
    expect(result.memories.scopes_available).toEqual([])
  })

  it('returns worktree_conflicts array', async () => {
    const result = await handleSessionStart(db, { worktree: TEST_WORKTREE })
    expect(Array.isArray(result.worktree_conflicts)).toBe(true)
  })
})

describe('update_task handler', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    teardownDb(db)
  })

  it('creates a new task when none exists', async () => {
    const result = await handleUpdateTask(db, {
      worktree: TEST_WORKTREE,
      title: 'Test Task',
      goal: 'Test the update_task handler',
    })
    expect(result.task_id).toBeDefined()
    expect(typeof result.task_id).toBe('string')
    expect(result.task_id.length).toBeGreaterThan(0)
  })

  it('session_start after update_task returns the task', async () => {
    await handleUpdateTask(db, {
      worktree: TEST_WORKTREE,
      title: 'Test Task',
      goal: 'Test goal',
    })

    const result = await handleSessionStart(db, { worktree: TEST_WORKTREE })
    expect(result.task).not.toBeNull()
    expect(result.task?.title).toBe('Test Task')
    expect(result.task?.goal).toBe('Test goal')
  })

  it('partial update only changes provided summary field', async () => {
    await handleUpdateTask(db, {
      worktree: TEST_WORKTREE,
      title: 'Original Title',
      goal: 'Original Goal',
    })

    await handleUpdateTask(db, {
      worktree: TEST_WORKTREE,
      summary: 'New summary',
    })

    const result = await handleSessionStart(db, { worktree: TEST_WORKTREE })
    expect(result.task).not.toBeNull()
    expect(result.task?.title).toBe('Original Title')
    expect(result.task?.goal).toBe('Original Goal')
    expect(result.task?.state?.summary).toBe('New summary')
  })

  it('returns same task_id on subsequent updates', async () => {
    const first = await handleUpdateTask(db, {
      worktree: TEST_WORKTREE,
      title: 'Test Task',
      goal: 'Test goal',
    })

    const second = await handleUpdateTask(db, {
      worktree: TEST_WORKTREE,
      summary: 'Updated summary',
    })

    expect(second.task_id).toBe(first.task_id)
  })

  it('creates task with default session_id if not provided', async () => {
    const result = await handleUpdateTask(db, {
      worktree: TEST_WORKTREE,
      title: 'Test',
      goal: 'Test goal',
    })

    const sessionResult = await handleSessionStart(db, { worktree: TEST_WORKTREE })
    expect(sessionResult.session_id).toBeDefined()
    expect(result.task_id).toBeDefined()
  })
})
