import { describe, it, expect } from 'vitest'
import { recencyFactor, scopeMatchBoost, computeScore, rankMemories } from '../../retrieval/ranker.js'
import type { Memory } from '../../db/memories.js'

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: 'test-id',
    type: 'convention',
    scope: 'api',
    content: 'test',
    confidence: 0.8,
    source: 'agent',
    evidence_count: 1,
    invalidated: 0,
    invalidation_reason: null,
    last_validated: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('recencyFactor', () => {
  it('returns 0.9 when last_validated is null', () => {
    expect(recencyFactor(null)).toBe(0.9)
  })

  it('returns 1.0 for 30 days ago', () => {
    const d = new Date(Date.now() - 30 * 86_400_000).toISOString()
    expect(recencyFactor(d)).toBeCloseTo(1.0, 5)
  })

  it('returns ~0.75 for 60 days ago (midpoint linear)', () => {
    const d = new Date(Date.now() - 60 * 86_400_000).toISOString()
    expect(recencyFactor(d)).toBeCloseTo(0.75, 1)
  })

  it('returns 0.5 for 90+ days ago', () => {
    const d = new Date(Date.now() - 91 * 86_400_000).toISOString()
    expect(recencyFactor(d)).toBe(0.5)
  })
})

describe('scopeMatchBoost', () => {
  it('returns 1.5 for matching scope', () => {
    expect(scopeMatchBoost('auth', ['auth', 'api'])).toBe(1.5)
  })

  it('returns 1.0 for general scope', () => {
    expect(scopeMatchBoost('general', ['auth'])).toBe(1.0)
  })

  it('returns 0.8 for non-matching non-general scope', () => {
    expect(scopeMatchBoost('api', ['auth'])).toBe(0.8)
  })
})

describe('computeScore', () => {
  it('multiplies confidence × recencyFactor × scopeMatchBoost', () => {
    const m = makeMemory({ confidence: 0.8, last_validated: null, scope: 'api' })
    const score = computeScore(m, ['api'])
    // 0.8 * 0.9 * 1.5 = 1.08
    expect(score).toBeCloseTo(1.08, 5)
  })
})

describe('rankMemories', () => {
  it('sorts by score DESC', () => {
    const low = makeMemory({ id: 'low', confidence: 0.3, scope: 'api' })
    const high = makeMemory({ id: 'high', confidence: 0.9, scope: 'api' })
    const ranked = rankMemories([low, high], ['api'])
    expect(ranked[0].id).toBe('high')
    expect(ranked[1].id).toBe('low')
  })

  it('uses evidence_count as tiebreaker', () => {
    const m1 = makeMemory({ id: 'm1', confidence: 0.5, evidence_count: 1, scope: 'general', last_validated: null })
    const m2 = makeMemory({ id: 'm2', confidence: 0.5, evidence_count: 5, scope: 'general', last_validated: null })
    const ranked = rankMemories([m1, m2], [])
    expect(ranked[0].id).toBe('m2')
  })
})
