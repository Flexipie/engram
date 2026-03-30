import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import type { Request, Response } from 'express'
import { createTestDb, teardownDb } from '../setup.js'
import { createEnforceHandler, type EnforcementStats } from '../../http/enforce.js'
import { handleCheckConventions } from '../../mcp/handlers/enforce.js'
import { insertMemory } from '../../db/memories.js'

const CONFIG = { warnThreshold: 0.6, blockThreshold: 0.8 }

function makeStats(): EnforcementStats {
  return { checks: 0, violations: 0, warnings: 0 }
}

function mockReqRes(body: unknown): { req: Request; res: { statusCode: number; body: unknown; status: (c: number) => ReturnType<typeof mockReqRes>['res']; json: (d: unknown) => void } } {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this },
    json(data: unknown) { this.body = data },
  }
  return { req: { body } as Request, res }
}

describe('POST /enforce handler', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    teardownDb(db)
  })

  it('returns 400 when file_path is missing', () => {
    const handler = createEnforceHandler(db, CONFIG, makeStats())
    const { req, res } = mockReqRes({})
    handler(req, res as unknown as Response)
    expect(res.statusCode).toBe(400)
  })

  it('returns 200 with empty violations/warnings for unknown file', () => {
    const handler = createEnforceHandler(db, CONFIG, makeStats())
    const { req, res } = mockReqRes({ file_path: 'src/api/handler.ts' })
    handler(req, res as unknown as Response)
    expect(res.statusCode).toBe(200)
    const body = res.body as { violations: string[]; warnings: string[] }
    expect(body.violations).toEqual([])
    expect(body.warnings).toEqual([])
  })

  it('returns non-empty violations when blocking memory exists', () => {
    // score = 0.85 × 1.0 × 1.5 = 1.275 ≥ 0.8 → violation
    const id = insertMemory(db, {
      type: 'anti_pattern',
      scope: 'api',
      content: 'Never use eval()',
      confidence: 0.85,
    })
    db.prepare('UPDATE memories SET last_validated = ? WHERE id = ?').run(
      new Date().toISOString(), id,
    )
    const handler = createEnforceHandler(db, CONFIG, makeStats())
    const { req, res } = mockReqRes({ file_path: 'src/api/handler.ts' })
    handler(req, res as unknown as Response)
    expect(res.statusCode).toBe(200)
    const body = res.body as { violations: string[] }
    expect(body.violations).toContain('Never use eval()')
  })

  it('returns warn-level memory in warnings, not violations', () => {
    // score = 0.5 × 0.9 × 1.5 = 0.675 → warning
    insertMemory(db, {
      type: 'convention',
      scope: 'api',
      content: 'Prefer named exports',
      confidence: 0.5,
    })
    const handler = createEnforceHandler(db, CONFIG, makeStats())
    const { req, res } = mockReqRes({ file_path: 'src/api/handler.ts' })
    handler(req, res as unknown as Response)
    const body = res.body as { violations: string[]; warnings: string[] }
    expect(body.warnings).toContain('Prefer named exports')
    expect(body.violations).not.toContain('Prefer named exports')
  })

  it('always returns 200 even when violations are present', () => {
    insertMemory(db, {
      type: 'anti_pattern',
      scope: 'api',
      content: 'Blocking rule',
      confidence: 0.99,
    })
    const handler = createEnforceHandler(db, CONFIG, makeStats())
    const { req, res } = mockReqRes({ file_path: 'src/api/handler.ts' })
    handler(req, res as unknown as Response)
    // HTTP always 200 — exit code decision belongs to caller
    expect(res.statusCode).toBe(200)
  })

  it('increments stats.checks on each call', () => {
    const stats = makeStats()
    const handler = createEnforceHandler(db, CONFIG, stats)
    const { req: r1, res: rs1 } = mockReqRes({ file_path: 'src/api/a.ts' })
    const { req: r2, res: rs2 } = mockReqRes({ file_path: 'src/api/b.ts' })
    handler(r1, rs1 as unknown as Response)
    handler(r2, rs2 as unknown as Response)
    expect(stats.checks).toBe(2)
  })

  it('increments stats.violations when violations found', () => {
    insertMemory(db, {
      type: 'anti_pattern',
      scope: 'api',
      content: 'Blocking rule',
      confidence: 0.99,
    })
    const stats = makeStats()
    const handler = createEnforceHandler(db, CONFIG, stats)
    const { req, res } = mockReqRes({ file_path: 'src/api/handler.ts' })
    handler(req, res as unknown as Response)
    expect(stats.violations).toBeGreaterThan(0)
  })

  it('stale (100-day-old) general memory with confidence=0.85 → not in violations', () => {
    // score = 0.85 × 0.5 (stale) × 1.0 (general) = 0.425 < 0.6 → excluded
    const id = insertMemory(db, {
      type: 'anti_pattern',
      scope: 'general',
      content: 'Stale rule should not block',
      confidence: 0.85,
    })
    const hundredDaysAgo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString()
    db.prepare('UPDATE memories SET last_validated = ? WHERE id = ?').run(hundredDaysAgo, id)

    const handler = createEnforceHandler(db, CONFIG, makeStats())
    const { req, res } = mockReqRes({ file_path: 'src/api/handler.ts' })
    handler(req, res as unknown as Response)
    const body = res.body as { violations: string[] }
    expect(body.violations).not.toContain('Stale rule should not block')
  })

  it('returns scope and memories_checked in response', () => {
    const handler = createEnforceHandler(db, CONFIG, makeStats())
    const { req, res } = mockReqRes({ file_path: 'src/api/handler.ts' })
    handler(req, res as unknown as Response)
    const body = res.body as { scope: string; memories_checked: number }
    expect(body.scope).toBe('api')
    expect(typeof body.memories_checked).toBe('number')
  })

  it('scope override via request body is respected', () => {
    insertMemory(db, {
      type: 'convention',
      scope: 'database',
      content: 'Use transactions',
      confidence: 0.99,
    })
    const handler = createEnforceHandler(db, CONFIG, makeStats())
    const { req, res } = mockReqRes({ file_path: 'src/api/handler.ts', scope: 'database' })
    handler(req, res as unknown as Response)
    const body = res.body as { violations: string[]; scope: string }
    expect(body.scope).toBe('database')
    expect(body.violations).toContain('Use transactions')
  })
})

describe('handleCheckConventions (MCP)', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    teardownDb(db)
  })

  it('returns same shape as HTTP handler', async () => {
    const result = await handleCheckConventions(db, CONFIG, { file_path: 'src/api/handler.ts' })
    expect(result).toHaveProperty('violations')
    expect(result).toHaveProperty('warnings')
    expect(result).toHaveProperty('scope')
    expect(result).toHaveProperty('memories_checked')
    expect(Array.isArray(result.violations)).toBe(true)
    expect(Array.isArray(result.warnings)).toBe(true)
  })

  it('returns violation for high-confidence blocking memory', async () => {
    insertMemory(db, {
      type: 'anti_pattern',
      scope: 'api',
      content: 'Never use any type',
      confidence: 0.99,
    })
    const result = await handleCheckConventions(db, CONFIG, { file_path: 'src/api/handler.ts' })
    expect(result.violations).toContain('Never use any type')
  })

  it('scope override is respected', async () => {
    insertMemory(db, {
      type: 'convention',
      scope: 'database',
      content: 'Use connection pooling',
      confidence: 0.99,
    })
    const result = await handleCheckConventions(db, CONFIG, {
      file_path: 'src/api/handler.ts',
      scope: 'database',
    })
    expect(result.scope).toBe('database')
    expect(result.violations).toContain('Use connection pooling')
  })
})
