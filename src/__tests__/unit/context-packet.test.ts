import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb, teardownDb } from '../setup.js'
import { insertMemory } from '../../db/memories.js'
import { buildContextPacket } from '../../retrieval/context-packet.js'

describe('buildContextPacket', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    teardownDb(db)
  })

  it('places high-score memories in critical', async () => {
    // confidence=0.8, scope match (api), null last_validated → 0.8 * 0.9 * 1.5 = 1.08 > 0.8
    insertMemory(db, { type: 'convention', scope: 'api', content: 'high score memory', confidence: 0.8 })
    const packet = await buildContextPacket(db, { detectedScopes: ['api'] })
    expect(packet.critical.length).toBeGreaterThan(0)
  })

  it('places mid-score memories in relevant', async () => {
    // confidence=0.5, scope match → 0.5 * 0.9 * 1.5 = 0.675 → relevant (0.4–0.8)
    insertMemory(db, { type: 'convention', scope: 'api', content: 'mid score memory', confidence: 0.5 })
    const packet = await buildContextPacket(db, { detectedScopes: ['api'] })
    expect(packet.relevant.length).toBeGreaterThan(0)
    expect(packet.critical.length).toBe(0)
  })

  it('excludes memories below 0.4 score', async () => {
    // confidence=0.2, no scope match → 0.2 * 0.9 * 0.8 = 0.144 → excluded
    insertMemory(db, { type: 'convention', scope: 'api', content: 'low score memory', confidence: 0.2 })
    const packet = await buildContextPacket(db, { detectedScopes: ['testing'] })
    expect(packet.critical.length).toBe(0)
    expect(packet.relevant.length).toBe(0)
  })

  it('anti_pattern goes to antipatterns and escapes cap', async () => {
    insertMemory(db, { type: 'anti_pattern', scope: 'api', content: 'bad pattern', confidence: 0.9 })
    const packet = await buildContextPacket(db, { detectedScopes: ['api'], limit: 1 })
    expect(packet.antipatterns.length).toBe(1)
    expect(packet.critical.length + packet.relevant.length).toBe(0)
  })

  it('respects limit cap across critical+relevant', async () => {
    for (let i = 0; i < 20; i++) {
      insertMemory(db, { type: 'convention', scope: 'api', content: `memory ${i}`, confidence: 0.9 })
    }
    const packet = await buildContextPacket(db, { detectedScopes: ['api'], limit: 5 })
    expect(packet.critical.length + packet.relevant.length).toBeLessThanOrEqual(5)
  })

  it('total_count reflects all matching memories not just capped', async () => {
    for (let i = 0; i < 20; i++) {
      insertMemory(db, { type: 'convention', scope: 'api', content: `memory ${i}`, confidence: 0.9 })
    }
    const packet = await buildContextPacket(db, { detectedScopes: ['api'], limit: 5 })
    expect(packet.total_count).toBe(20)
  })

  it('scopes_available lists all unique scopes regardless of filter', async () => {
    insertMemory(db, { type: 'convention', scope: 'api', content: 'api memory', confidence: 0.9 })
    insertMemory(db, { type: 'convention', scope: 'testing', content: 'test memory', confidence: 0.9 })
    const packet = await buildContextPacket(db, { detectedScopes: ['api'], scopes: ['api'] })
    expect(packet.scopes_available).toContain('api')
    expect(packet.scopes_available).toContain('testing')
  })
})
