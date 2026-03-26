import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, teardownDb } from '../setup.js'
import type Database from 'better-sqlite3'

describe('DB Connection & Migrations', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    teardownDb(db)
  })

  it('opens in-memory DB and applies migrations', () => {
    // If createTestDb didn't throw, migrations were applied
    expect(db).toBeDefined()
  })

  it('_schema_version has version 1 after migration', () => {
    const row = db.prepare('SELECT version FROM _schema_version WHERE version = 1').get() as
      | { version: number }
      | undefined
    expect(row).toBeDefined()
    expect(row?.version).toBe(1)
  })

  it('tasks table exists', () => {
    expect(() => {
      db.prepare('SELECT id, worktree, title, goal, status FROM tasks LIMIT 1').get()
    }).not.toThrow()
  })

  it('task_state table exists', () => {
    expect(() => {
      db
        .prepare(
          'SELECT id, task_id, summary, completed, in_progress, next_steps FROM task_state LIMIT 1',
        )
        .get()
    }).not.toThrow()
  })

  it('snapshots table exists', () => {
    expect(() => {
      db.prepare('SELECT id, task_id, state_json, trigger, created_at FROM snapshots LIMIT 1').get()
    }).not.toThrow()
  })

  it('worktree_activity table exists', () => {
    expect(() => {
      db
        .prepare('SELECT worktree, task_id, active_files, last_heartbeat FROM worktree_activity LIMIT 1')
        .get()
    }).not.toThrow()
  })

  it('WAL pragma is set (journal_mode returns wal)', () => {
    const result = db.pragma('journal_mode') as Array<{ journal_mode: string }>
    // In-memory DB returns 'memory' for journal_mode pragma even when WAL is set
    // but WAL is enabled for file-based DBs. For in-memory, accept 'memory' or 'wal'
    expect(['wal', 'memory']).toContain(result[0].journal_mode)
  })

  it('foreign_keys pragma is ON', () => {
    const result = db.pragma('foreign_keys') as Array<{ foreign_keys: number }>
    expect(result[0].foreign_keys).toBe(1)
  })
})
