import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb } from '../setup.js'
import { insertMemory, queryMemories } from '../../db/memories.js'
import { exportData, importData } from '../../cli/commands/export.js'
import type Database from 'better-sqlite3'

describe('export/import round trip', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    db.close()
  })

  it('exports memories correctly', () => {
    insertMemory(db, { type: 'convention', scope: 'api', content: 'always validate', source: 'manual', confidence: 0.8 })
    insertMemory(db, { type: 'decision', scope: 'general', content: 'use sqlite', source: 'agent', confidence: 0.5 })

    const exported = exportData(db, { domain: 'software', projectDir: '/test' })
    expect(exported.version).toBe('1.0')
    expect(exported.domain).toBe('software')
    expect(exported.memories.length).toBe(2)
    expect(exported.error_patterns).toEqual([])
  })

  it('imports memories into empty db', () => {
    insertMemory(db, { type: 'convention', scope: 'api', content: 'always validate', source: 'manual', confidence: 0.8 })
    const exported = exportData(db, { domain: 'software', projectDir: '/test' })

    const db2 = createTestDb()
    const result = importData(db2, exported, { replace: false })
    expect(result.imported).toBe(1)
    expect(result.skipped).toBe(0)

    const memories = queryMemories(db2)
    expect(memories.length).toBe(1)
    expect(memories[0].content).toBe('always validate')
    db2.close()
  })

  it('deduplicates by content on merge import', () => {
    insertMemory(db, { type: 'convention', scope: 'api', content: 'always validate', source: 'manual', confidence: 0.8 })
    const exported = exportData(db, { domain: 'software', projectDir: '/test' })

    const db2 = createTestDb()
    insertMemory(db2, { type: 'convention', scope: 'api', content: 'always validate', source: 'agent', confidence: 0.5 })

    const result = importData(db2, exported, { replace: false })
    expect(result.imported).toBe(0)
    expect(result.skipped).toBe(1)

    db2.close()
  })

  it('replace mode wipes existing memories before import', () => {
    insertMemory(db, { type: 'convention', scope: 'api', content: 'source content', source: 'agent', confidence: 0.5 })
    const exported = exportData(db, { domain: 'software', projectDir: '/test' })

    const db2 = createTestDb()
    insertMemory(db2, { type: 'decision', scope: 'general', content: 'old memory to wipe', source: 'agent', confidence: 0.5 })

    const result = importData(db2, exported, { replace: true })
    expect(result.imported).toBe(1)

    const memories = queryMemories(db2)
    expect(memories.find((m) => m.content === 'old memory to wipe')).toBeUndefined()
    expect(memories.find((m) => m.content === 'source content')).toBeTruthy()

    db2.close()
  })

  it('throws on unsupported version', () => {
    const badData = { version: '2.0', memories: [], error_patterns: [] }
    const db2 = createTestDb()
    expect(() => importData(db2, badData as unknown as ReturnType<typeof exportData>, { replace: false })).toThrow()
    db2.close()
  })

  it('full round trip preserves memory content and type', () => {
    insertMemory(db, { type: 'anti_pattern', scope: 'testing', content: 'never mock db', source: 'manual', confidence: 0.9 })
    const exported = exportData(db, { domain: 'software', projectDir: '/test' })

    const db2 = createTestDb()
    importData(db2, exported, { replace: false })

    const memories = queryMemories(db2)
    expect(memories[0].type).toBe('anti_pattern')
    expect(memories[0].scope).toBe('testing')
    expect(memories[0].content).toBe('never mock db')
    db2.close()
  })
})
