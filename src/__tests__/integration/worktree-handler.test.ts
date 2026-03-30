import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb, teardownDb } from '../setup.js'
import { handleSessionStart, handleUpdateTask } from '../../mcp/handlers/session.js'
import { handleGetWorktreeStatus } from '../../mcp/handlers/worktree.js'
import { upsertWorktreeActivity } from '../../db/worktrees.js'

const WORKTREE_A = '/projects/app'
const WORKTREE_B = '/projects/app-feature-branch'
const WORKTREE_C = '/projects/app-hotfix'

describe('handleGetWorktreeStatus', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    teardownDb(db)
  })

  it('returns empty active_worktrees when no activity recorded', async () => {
    const result = await handleGetWorktreeStatus(db, { worktree: WORKTREE_A })
    expect(result.active_worktrees).toEqual([])
    expect(result.file_conflicts).toEqual([])
  })

  it('does not include the calling worktree in active_worktrees', async () => {
    upsertWorktreeActivity(db, WORKTREE_A, undefined, ['src/api/handler.ts'])
    const result = await handleGetWorktreeStatus(db, { worktree: WORKTREE_A })
    expect(result.active_worktrees.map(w => w.worktree)).not.toContain(WORKTREE_A)
  })

  it('returns other active worktrees', async () => {
    upsertWorktreeActivity(db, WORKTREE_A, undefined, [])
    upsertWorktreeActivity(db, WORKTREE_B, undefined, ['src/api/handler.ts'])

    const result = await handleGetWorktreeStatus(db, { worktree: WORKTREE_A })
    expect(result.active_worktrees).toHaveLength(1)
    expect(result.active_worktrees[0].worktree).toBe(WORKTREE_B)
  })

  it('includes age_seconds in each worktree entry', async () => {
    upsertWorktreeActivity(db, WORKTREE_B, undefined, [])
    const result = await handleGetWorktreeStatus(db, { worktree: WORKTREE_A })
    expect(typeof result.active_worktrees[0].age_seconds).toBe('number')
    expect(result.active_worktrees[0].age_seconds).toBeGreaterThanOrEqual(0)
  })

  it('includes active_files per worktree', async () => {
    upsertWorktreeActivity(db, WORKTREE_B, undefined, ['src/api/a.ts', 'src/db/b.ts'])
    const result = await handleGetWorktreeStatus(db, { worktree: WORKTREE_A })
    expect(result.active_worktrees[0].active_files).toContain('src/api/a.ts')
    expect(result.active_worktrees[0].active_files).toContain('src/db/b.ts')
  })

  it('detects file_conflicts: key_files of calling worktree vs active_files of others', async () => {
    // Set up worktree A with a task whose key_files overlap with B's active_files
    await handleUpdateTask(db, {
      worktree: WORKTREE_A,
      title: 'Feature A',
      goal: 'Build feature',
      key_files: ['src/api/handler.ts', 'src/db/schema.ts'],
    })
    upsertWorktreeActivity(db, WORKTREE_B, undefined, ['src/api/handler.ts', 'src/utils/helper.ts'])

    const result = await handleGetWorktreeStatus(db, { worktree: WORKTREE_A })
    expect(result.file_conflicts).toContain('src/api/handler.ts')
    expect(result.file_conflicts).not.toContain('src/db/schema.ts')  // not in B's active_files
    expect(result.file_conflicts).not.toContain('src/utils/helper.ts')  // not in A's key_files
  })

  it('returns empty file_conflicts when no overlap', async () => {
    await handleUpdateTask(db, {
      worktree: WORKTREE_A,
      title: 'Feature A',
      goal: 'Build feature',
      key_files: ['src/auth/login.ts'],
    })
    upsertWorktreeActivity(db, WORKTREE_B, undefined, ['src/api/handler.ts'])

    const result = await handleGetWorktreeStatus(db, { worktree: WORKTREE_A })
    expect(result.file_conflicts).toEqual([])
  })

  it('returns empty file_conflicts when calling worktree has no task', async () => {
    upsertWorktreeActivity(db, WORKTREE_B, undefined, ['src/api/handler.ts'])
    const result = await handleGetWorktreeStatus(db, { worktree: WORKTREE_A })
    expect(result.file_conflicts).toEqual([])
  })

  it('returns file_conflicts across multiple other worktrees', async () => {
    await handleUpdateTask(db, {
      worktree: WORKTREE_A,
      title: 'Feature A',
      goal: 'Build',
      key_files: ['src/api/handler.ts', 'src/db/schema.ts', 'src/auth/login.ts'],
    })
    upsertWorktreeActivity(db, WORKTREE_B, undefined, ['src/api/handler.ts'])
    upsertWorktreeActivity(db, WORKTREE_C, undefined, ['src/db/schema.ts'])

    const result = await handleGetWorktreeStatus(db, { worktree: WORKTREE_A })
    expect(result.file_conflicts).toContain('src/api/handler.ts')
    expect(result.file_conflicts).toContain('src/db/schema.ts')
    expect(result.file_conflicts).not.toContain('src/auth/login.ts')
    // no duplicates
    expect(new Set(result.file_conflicts).size).toBe(result.file_conflicts.length)
  })

  it('includes task_title and task_goal when worktree has an active task', async () => {
    await handleUpdateTask(db, {
      worktree: WORKTREE_B,
      title: 'Fix auth bug',
      goal: 'Resolve login timeout',
    })
    upsertWorktreeActivity(db, WORKTREE_B, undefined, [])

    const result = await handleGetWorktreeStatus(db, { worktree: WORKTREE_A })
    expect(result.active_worktrees[0].task_title).toBe('Fix auth bug')
    expect(result.active_worktrees[0].task_goal).toBe('Resolve login timeout')
  })

  it('task_title and task_goal are null when worktree has no task', async () => {
    upsertWorktreeActivity(db, WORKTREE_B, undefined, [])
    const result = await handleGetWorktreeStatus(db, { worktree: WORKTREE_A })
    expect(result.active_worktrees[0].task_title).toBeNull()
    expect(result.active_worktrees[0].task_goal).toBeNull()
  })

  it('defaults to process.cwd() when worktree param omitted', async () => {
    upsertWorktreeActivity(db, WORKTREE_B, undefined, [])
    // Should not throw
    const result = await handleGetWorktreeStatus(db, {})
    expect(Array.isArray(result.active_worktrees)).toBe(true)
  })
})

describe('session_start file_conflicts', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    teardownDb(db)
  })

  it('session_start response includes file_conflicts field', async () => {
    const result = await handleSessionStart(db, { worktree: WORKTREE_A })
    expect(result).toHaveProperty('file_conflicts')
    expect(Array.isArray(result.file_conflicts)).toBe(true)
  })

  it('file_conflicts is empty when no other worktrees active', async () => {
    await handleUpdateTask(db, {
      worktree: WORKTREE_A,
      key_files: ['src/api/handler.ts'],
    })
    const result = await handleSessionStart(db, { worktree: WORKTREE_A })
    expect(result.file_conflicts).toEqual([])
  })

  it('file_conflicts shows overlap between task key_files and other worktree active_files', async () => {
    // Set up another worktree already active with files
    upsertWorktreeActivity(db, WORKTREE_B, undefined, ['src/api/handler.ts', 'src/utils/helper.ts'])

    // Current worktree had a previous task with key_files
    await handleUpdateTask(db, {
      worktree: WORKTREE_A,
      title: 'My task',
      goal: 'Do work',
      key_files: ['src/api/handler.ts', 'src/auth/login.ts'],
    })

    const result = await handleSessionStart(db, { worktree: WORKTREE_A })
    expect(result.file_conflicts).toContain('src/api/handler.ts')
    expect(result.file_conflicts).not.toContain('src/auth/login.ts')  // not in B's active_files
  })
})
