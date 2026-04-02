import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb } from '../setup.js'
import { insertMemory, queryMemories } from '../../db/memories.js'
import { setActiveProfile, getActiveScopes } from '../../domain/active-profile.js'
import type Database from 'better-sqlite3'

describe('dynamic scopes', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
    setActiveProfile('software')
  })

  afterEach(() => {
    db.close()
    setActiveProfile('software')
  })

  it('accepts software scopes by default', () => {
    const id = insertMemory(db, { type: 'convention', scope: 'api', content: 'test', source: 'agent' })
    expect(id).toBeTruthy()
    const memories = queryMemories(db, { scopes: ['api'] })
    expect(memories.length).toBe(1)
  })

  it('accepts custom scopes in legal domain (DB stores any string)', () => {
    setActiveProfile('legal')
    const id = insertMemory(db, {
      type: 'convention',
      scope: 'litigation',
      content: 'cite primary sources',
      source: 'agent',
    })
    expect(id).toBeTruthy()
    const memories = queryMemories(db, { scopes: ['litigation'] })
    expect(memories.length).toBe(1)
  })

  it('getActiveScopes returns legal scopes after switching profile', () => {
    setActiveProfile('legal')
    const scopes = getActiveScopes()
    expect(scopes).toContain('litigation')
    expect(scopes).toContain('general')
    expect(scopes).not.toContain('auth')
  })

  it('getActiveScopes returns software scopes by default', () => {
    setActiveProfile('software')
    const scopes = getActiveScopes()
    expect(scopes).toContain('auth')
    expect(scopes).toContain('api')
    expect(scopes).toContain('database')
    expect(scopes).toContain('general')
  })

  it('research profile has methodology scope', () => {
    setActiveProfile('research')
    const scopes = getActiveScopes()
    expect(scopes).toContain('methodology')
    expect(scopes).toContain('literature')
    expect(scopes).toContain('general')
  })
})
