import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb, teardownDb } from '../setup.js'
import { checkConventions } from '../../enforcement/checker.js'
import { insertMemory } from '../../db/memories.js'

const CONFIG = { warnThreshold: 0.6, blockThreshold: 0.8 }

describe('checkConventions', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    teardownDb(db)
  })

  // --- Core logic ---

  it('empty DB returns no violations or warnings', () => {
    const result = checkConventions(db, 'src/api/handler.ts', CONFIG)
    expect(result.violations).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.memories_checked).toBe(0)
  })

  it('anti_pattern with high confidence, recent, matching scope → violation', () => {
    // score = 0.85 × 1.0 (recent) × 1.5 (scope match) = 1.275 ≥ 0.8
    const id = insertMemory(db, {
      type: 'anti_pattern',
      scope: 'api',
      content: 'Never use any type in TypeScript',
      confidence: 0.85,
    })
    // Set last_validated to now
    db.prepare('UPDATE memories SET last_validated = ? WHERE id = ?').run(
      new Date().toISOString(), id,
    )
    const result = checkConventions(db, 'src/api/handler.ts', CONFIG)
    expect(result.violations).toContain('Never use any type in TypeScript')
    expect(result.warnings).not.toContain('Never use any type in TypeScript')
    expect(result.scope).toBe('api')
  })

  it('anti_pattern with high confidence but 100 days old, general scope → below threshold (excluded)', () => {
    // score = 0.85 × 0.5 (stale) × 1.0 (general) = 0.425 < 0.6 → excluded
    const id = insertMemory(db, {
      type: 'anti_pattern',
      scope: 'general',
      content: 'Stale rule that should not block',
      confidence: 0.85,
    })
    const hundredDaysAgo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString()
    db.prepare('UPDATE memories SET last_validated = ? WHERE id = ?').run(hundredDaysAgo, id)

    const result = checkConventions(db, 'src/api/handler.ts', CONFIG)
    expect(result.violations).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it('convention with confidence=0.7, no last_validated, matching scope → violation', () => {
    // score = 0.7 × 0.9 (no last_validated) × 1.5 (scope match) = 0.945 ≥ 0.8
    insertMemory(db, {
      type: 'convention',
      scope: 'api',
      content: 'Always validate with Zod at API boundaries',
      confidence: 0.7,
    })
    const result = checkConventions(db, 'src/api/routes.ts', CONFIG)
    expect(result.violations).toContain('Always validate with Zod at API boundaries')
  })

  it('memory with score in warn tier (0.6–0.8) → warning only', () => {
    // score = 0.5 × 0.9 × 1.5 = 0.675 → between 0.6 and 0.8 → warning
    insertMemory(db, {
      type: 'convention',
      scope: 'api',
      content: 'Prefer async/await over callbacks',
      confidence: 0.5,
    })
    const result = checkConventions(db, 'src/api/handler.ts', CONFIG)
    expect(result.warnings).toContain('Prefer async/await over callbacks')
    expect(result.violations).not.toContain('Prefer async/await over callbacks')
  })

  it('memory with score below warn threshold → excluded entirely', () => {
    // score = 0.3 × 0.9 × 1.5 = 0.405 < 0.6 → excluded
    insertMemory(db, {
      type: 'convention',
      scope: 'api',
      content: 'Low confidence rule',
      confidence: 0.3,
    })
    const result = checkConventions(db, 'src/api/handler.ts', CONFIG)
    expect(result.violations).toEqual([])
    expect(result.warnings).toEqual([])
  })

  // --- Type filtering ---

  it('snippet type is excluded regardless of confidence', () => {
    insertMemory(db, {
      type: 'snippet',
      scope: 'api',
      content: 'const handler = ...',
      confidence: 0.99,
    })
    const result = checkConventions(db, 'src/api/handler.ts', CONFIG)
    expect(result.violations).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.memories_checked).toBe(0)
  })

  it('error_pattern type is excluded regardless of confidence', () => {
    insertMemory(db, {
      type: 'error_pattern',
      scope: 'api',
      content: 'ECONNREFUSED fix: restart server',
      confidence: 0.99,
    })
    const result = checkConventions(db, 'src/api/handler.ts', CONFIG)
    expect(result.violations).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.memories_checked).toBe(0)
  })

  it('decision type with high score → warning only, never violation', () => {
    // score = 0.85 × 1.0 × 1.5 = 1.275 ≥ 0.8, but decision → warning only
    const id = insertMemory(db, {
      type: 'decision',
      scope: 'api',
      content: 'We use REST not GraphQL for all API endpoints',
      confidence: 0.85,
    })
    db.prepare('UPDATE memories SET last_validated = ? WHERE id = ?').run(
      new Date().toISOString(), id,
    )
    const result = checkConventions(db, 'src/api/handler.ts', CONFIG)
    expect(result.violations).not.toContain('We use REST not GraphQL for all API endpoints')
    expect(result.warnings).toContain('We use REST not GraphQL for all API endpoints')
  })

  // --- Scope logic ---

  it('general scope memory returned for any file path', () => {
    insertMemory(db, {
      type: 'convention',
      scope: 'general',
      content: 'General coding convention',
      confidence: 0.9,
    })
    // score = 0.9 × 0.9 × 1.0 (general boost) = 0.81 ≥ 0.8 → violation
    const result = checkConventions(db, 'src/api/handler.ts', CONFIG)
    expect(result.violations).toContain('General coding convention')
  })

  it('memory in non-matching scope is excluded from results', () => {
    insertMemory(db, {
      type: 'convention',
      scope: 'auth',
      content: 'Auth-specific rule',
      confidence: 0.99,
    })
    // querying for 'api' scope → only ['api', 'general'] returned; auth excluded
    const result = checkConventions(db, 'src/api/handler.ts', CONFIG)
    expect(result.violations).not.toContain('Auth-specific rule')
    expect(result.warnings).not.toContain('Auth-specific rule')
  })

  it('scopeOverride is respected over fileToScope result', () => {
    insertMemory(db, {
      type: 'convention',
      scope: 'database',
      content: 'Always use transactions for multi-step writes',
      confidence: 0.9,
    })
    // file would normally be 'api' but override to 'database'
    const result = checkConventions(db, 'src/api/handler.ts', CONFIG, 'database')
    expect(result.violations).toContain('Always use transactions for multi-step writes')
    expect(result.scope).toBe('database')
  })

  it('unmapped file path falls back to general scope', () => {
    insertMemory(db, {
      type: 'convention',
      scope: 'general',
      content: 'Global rule applies everywhere',
      confidence: 0.9,
    })
    // README.md maps to 'general'
    const result = checkConventions(db, 'README.md', CONFIG)
    expect(result.scope).toBe('general')
    expect(result.violations).toContain('Global rule applies everywhere')
  })

  // --- Data integrity ---

  it('invalidated memory is excluded even at high confidence', () => {
    const id = insertMemory(db, {
      type: 'anti_pattern',
      scope: 'api',
      content: 'Invalidated rule',
      confidence: 0.99,
    })
    db.prepare("UPDATE memories SET invalidated = 1 WHERE id = ?").run(id)
    const result = checkConventions(db, 'src/api/handler.ts', CONFIG)
    expect(result.violations).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it('memories_checked excludes snippet and error_pattern types', () => {
    insertMemory(db, { type: 'convention', scope: 'api', content: 'convention rule', confidence: 0.9 })
    insertMemory(db, { type: 'snippet', scope: 'api', content: 'snippet content', confidence: 0.9 })
    insertMemory(db, { type: 'error_pattern', scope: 'api', content: 'error pattern', confidence: 0.9 })

    const result = checkConventions(db, 'src/api/handler.ts', CONFIG)
    // Only the convention memory is checked
    expect(result.memories_checked).toBe(1)
  })

  it('memories_checked counts both scope and general memories', () => {
    insertMemory(db, { type: 'convention', scope: 'api', content: 'api rule', confidence: 0.9 })
    insertMemory(db, { type: 'convention', scope: 'general', content: 'general rule', confidence: 0.9 })
    insertMemory(db, { type: 'convention', scope: 'auth', content: 'auth rule', confidence: 0.9 })

    const result = checkConventions(db, 'src/api/handler.ts', CONFIG)
    // api + general returned, auth excluded
    expect(result.memories_checked).toBe(2)
  })
})
