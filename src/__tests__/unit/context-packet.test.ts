import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb, createTestGlobalDb, teardownDb } from '../setup.js'
import { insertMemory } from '../../db/memories.js'
import { insertGlobalMemory } from '../../db/global.js'
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

  it('include_global defaults to true — global memories included when globalDb provided', async () => {
    const globalDb = createTestGlobalDb()
    insertGlobalMemory(globalDb, {
      type: 'convention',
      scope: 'api',
      content: 'global memory',
      confidence: 0.9,
      project_origin: '/some/project',
    })
    // No explicit includeGlobal — default is true
    const packet = await buildContextPacket(db, { detectedScopes: ['api'], globalDb })
    expect(packet.global.length).toBeGreaterThan(0)
    globalDb.close()
  })

  it('include_global: false excludes global memories', async () => {
    const globalDb = createTestGlobalDb()
    insertGlobalMemory(globalDb, {
      type: 'convention',
      scope: 'api',
      content: 'global memory',
      confidence: 0.9,
      project_origin: '/some/project',
    })
    const packet = await buildContextPacket(db, { detectedScopes: ['api'], globalDb, includeGlobal: false })
    expect(packet.global.length).toBe(0)
    globalDb.close()
  })

  it('no explicit scopes returns memories from all scopes', async () => {
    insertMemory(db, { type: 'convention', scope: 'api', content: 'api mem', confidence: 0.9 })
    insertMemory(db, { type: 'convention', scope: 'testing', content: 'test mem', confidence: 0.9 })
    insertMemory(db, { type: 'convention', scope: 'database', content: 'db mem', confidence: 0.9 })
    // No scopes filter — should return all
    const packet = await buildContextPacket(db, { detectedScopes: [] })
    const allReturned = [...packet.critical, ...packet.relevant]
    const returnedScopes = new Set(allReturned.map((m) => m.scope))
    expect(returnedScopes.has('api')).toBe(true)
    expect(returnedScopes.has('testing')).toBe(true)
    expect(returnedScopes.has('database')).toBe(true)
  })

  it('explicit scopes still filters correctly', async () => {
    insertMemory(db, { type: 'convention', scope: 'api', content: 'api mem', confidence: 0.9 })
    insertMemory(db, { type: 'convention', scope: 'testing', content: 'test mem', confidence: 0.9 })
    const packet = await buildContextPacket(db, { detectedScopes: ['api'], scopes: ['api'] })
    const allReturned = [...packet.critical, ...packet.relevant]
    expect(allReturned.every((m) => m.scope === 'api')).toBe(true)
  })

  it('also_found populated when capped results have unreturned memories', async () => {
    // Insert memories across two scopes; limit to 1 so some are left out
    insertMemory(db, { type: 'convention', scope: 'api', content: 'api mem 1', confidence: 0.9 })
    insertMemory(db, { type: 'convention', scope: 'api', content: 'api mem 2', confidence: 0.9 })
    insertMemory(db, { type: 'convention', scope: 'testing', content: 'test mem', confidence: 0.9 })
    const packet = await buildContextPacket(db, { detectedScopes: ['api'], limit: 1 })
    expect(packet.also_found).toBeDefined()
    expect(packet.also_found!.total).toBeGreaterThan(1)
    expect(Array.isArray(packet.also_found!.scopes)).toBe(true)
  })

  it('also_found is undefined when all memories fit in results', async () => {
    insertMemory(db, { type: 'convention', scope: 'api', content: 'single mem', confidence: 0.9 })
    const packet = await buildContextPacket(db, { detectedScopes: ['api'], limit: 15 })
    // single high-confidence memory fits — also_found should be absent or undefined
    // (low-score memories below 0.4 threshold won't appear but also_found only covers ranked ones excluded by cap)
    expect(packet.also_found).toBeUndefined()
  })
})
