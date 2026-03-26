import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb, teardownDb } from '../setup.js'
import {
  insertMemory,
  queryMemories,
  invalidateMemory,
  getMemoryById,
} from '../../db/memories.js'

describe('db memories', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    teardownDb(db)
  })

  it('insertMemory returns UUID and memory appears in DB', () => {
    const id = insertMemory(db, { type: 'convention', scope: 'api', content: 'test content' })
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    const m = getMemoryById(db, id)
    expect(m).not.toBeNull()
    expect(m!.content).toBe('test content')
  })

  it('queryMemories with scopes filter returns only matching', () => {
    insertMemory(db, { type: 'convention', scope: 'api', content: 'api memory' })
    insertMemory(db, { type: 'convention', scope: 'testing', content: 'test memory' })
    const results = queryMemories(db, { scopes: ['api'] })
    expect(results.every((m) => m.scope === 'api')).toBe(true)
    expect(results.length).toBe(1)
  })

  it('queryMemories with query finds matching memory via FTS', () => {
    insertMemory(db, { type: 'convention', scope: 'api', content: 'always use zod at boundaries' })
    insertMemory(db, { type: 'convention', scope: 'testing', content: 'write unit tests' })
    const results = queryMemories(db, { query: 'zod' })
    expect(results.length).toBe(1)
    expect(results[0].content).toContain('zod')
  })

  it('FTS fallback: query with special chars does not throw', () => {
    insertMemory(db, { type: 'convention', scope: 'api', content: 'use arrow functions for callbacks' })
    expect(() => queryMemories(db, { query: '->' })).not.toThrow()
  })

  it('FTS fallback: query with parens does not throw', () => {
    insertMemory(db, { type: 'convention', scope: 'api', content: 'call parse() on schemas' })
    expect(() => queryMemories(db, { query: 'parse()' })).not.toThrow()
  })

  it('invalidateMemory sets invalidated=1 and excludes from subsequent queries', () => {
    const id = insertMemory(db, { type: 'convention', scope: 'api', content: 'to invalidate' })
    invalidateMemory(db, id, 'outdated')
    const results = queryMemories(db, { excludeInvalidated: true })
    expect(results.find((m) => m.id === id)).toBeUndefined()
    const m = getMemoryById(db, id)
    expect(m!.invalidated).toBe(1)
    expect(m!.invalidation_reason).toBe('outdated')
  })

  it('getMemoryById returns null for unknown id', () => {
    expect(getMemoryById(db, 'nonexistent')).toBeNull()
  })

  it('invalidateMemory returns false for unknown id', () => {
    const result = invalidateMemory(db, 'nonexistent')
    expect(result).toBe(false)
  })
})
