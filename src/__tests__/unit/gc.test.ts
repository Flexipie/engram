import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb } from '../setup.js'
import { insertMemory } from '../../db/memories.js'
import { runGc } from '../../cli/commands/gc.js'
import type Database from 'better-sqlite3'

describe('gc command', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    db.close()
  })

  it('archives memories with confidence below 0.2', () => {
    const id1 = insertMemory(db, { type: 'convention', scope: 'general', content: 'low conf', confidence: 0.1, source: 'agent' })
    const id2 = insertMemory(db, { type: 'convention', scope: 'general', content: 'ok conf', confidence: 0.5, source: 'agent' })

    const result = runGc(db)

    expect(result.memoriesArchived).toBe(1)
    const archived = db.prepare('SELECT * FROM memories WHERE id = ?').get(id1) as { invalidated: number } | undefined
    expect(archived?.invalidated).toBe(1)
    const ok = db.prepare('SELECT * FROM memories WHERE id = ?').get(id2) as { invalidated: number } | undefined
    expect(ok?.invalidated).toBe(0)
  })

  it('does not archive memories already invalidated', () => {
    // Insert low confidence, then manually invalidate
    const id = insertMemory(db, { type: 'convention', scope: 'general', content: 'pre-invalidated', confidence: 0.1, source: 'agent' })
    db.prepare('UPDATE memories SET invalidated = 1 WHERE id = ?').run(id)

    const result = runGc(db)
    // Already invalidated, so gc shouldn't double-count
    expect(result.memoriesArchived).toBe(0)
  })

  it('prunes snapshots keeping last 3 per task', () => {
    const taskId = 'test-task-gc'
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO tasks (id, worktree, title, goal, status, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(taskId, '/test', 'Test Task', 'goal', 'active', now, now)
    // Insert 5 snapshots for same task with different timestamps
    for (let i = 0; i < 5; i++) {
      db.prepare(
        `INSERT INTO snapshots (id, task_id, state_json, trigger, created_at) VALUES (?, ?, ?, ?, ?)`,
      ).run(`snap-gc-${i}`, taskId, '{}', 'manual', new Date(Date.now() + i * 1000).toISOString())
    }

    const countBefore = (db.prepare('SELECT COUNT(*) as c FROM snapshots WHERE task_id = ?').get(taskId) as { c: number }).c
    expect(countBefore).toBe(5)

    const result = runGc(db)
    expect(result.snapshotsPruned).toBe(2)

    const countAfter = (db.prepare('SELECT COUNT(*) as c FROM snapshots WHERE task_id = ?').get(taskId) as { c: number }).c
    expect(countAfter).toBe(3)
  })

  it('does not prune when 3 or fewer snapshots exist', () => {
    const taskId = 'test-task-gc-small'
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO tasks (id, worktree, title, goal, status, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(taskId, '/test-small', 'Test Small', 'goal', 'active', now, now)
    for (let i = 0; i < 2; i++) {
      db.prepare(
        `INSERT INTO snapshots (id, task_id, state_json, trigger, created_at) VALUES (?, ?, ?, ?, ?)`,
      ).run(`snap-small-${i}`, taskId, '{}', 'manual', new Date(Date.now() + i * 1000).toISOString())
    }

    const result = runGc(db)
    expect(result.snapshotsPruned).toBe(0)
  })

  it('returns a GcResult with all fields', () => {
    const result = runGc(db)
    expect(result).toHaveProperty('memoriesArchived')
    expect(result).toHaveProperty('snapshotsPruned')
    expect(result).toHaveProperty('tasksArchived')
    expect(typeof result.memoriesArchived).toBe('number')
    expect(typeof result.snapshotsPruned).toBe('number')
    expect(typeof result.tasksArchived).toBe('number')
  })

  it('returns zero counts when nothing to collect', () => {
    const result = runGc(db)
    expect(result.memoriesArchived).toBe(0)
    expect(result.snapshotsPruned).toBe(0)
    expect(result.tasksArchived).toBe(0)
  })
})
