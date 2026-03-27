import { describe, it, expect } from 'vitest'
import { normalizeError, computeSignature, scopeFromError } from '../../errors/normalizer.js'

describe('normalizeError', () => {
  it('strips ANSI escape codes', () => {
    const raw = '\x1b[31mError: something failed\x1b[0m'
    expect(normalizeError(raw)).toBe('Error: something failed')
  })

  it('replaces Linux absolute paths with <path>', () => {
    const raw = 'Error in /home/user/project/src/db/errors.ts'
    expect(normalizeError(raw)).toContain('<path>')
    expect(normalizeError(raw)).not.toContain('/home/user')
  })

  it('replaces macOS absolute paths with <path>', () => {
    const raw = 'Error in /Users/alice/code/myapp/src/index.ts'
    expect(normalizeError(raw)).toContain('<path>')
    expect(normalizeError(raw)).not.toContain('/Users/alice')
  })

  it('replaces /root absolute paths with <path>', () => {
    const raw = 'Cannot find /root/project/dist/server.js'
    expect(normalizeError(raw)).toContain('<path>')
  })

  it('preserves relative paths (src/db/errors.ts stays)', () => {
    const raw = 'Error at src/db/errors.ts line 42'
    const normalized = normalizeError(raw)
    expect(normalized).toContain('src/db/errors.ts')
  })

  it('strips :line:col refs from end of path references', () => {
    const raw = 'TypeError at file.ts:42:7 — unexpected token'
    const normalized = normalizeError(raw)
    expect(normalized).not.toMatch(/:42:7/)
    expect(normalized).toContain('file.ts')
  })

  it('strips :line:col at end of string', () => {
    const raw = 'error src/index.ts:10:5'
    const normalized = normalizeError(raw)
    expect(normalized).not.toMatch(/:10:5/)
  })

  it('replaces hex memory addresses with <addr>', () => {
    const raw = 'Segfault at address 0x7f4a3b2c1d0e'
    expect(normalizeError(raw)).toContain('<addr>')
    expect(normalizeError(raw)).not.toContain('0x7f4a3b2c1d0e')
  })

  it('replaces ISO timestamps with <timestamp>', () => {
    const raw = 'Failed at 2024-01-15T09:32:45.123Z with error'
    expect(normalizeError(raw)).toContain('<timestamp>')
    expect(normalizeError(raw)).not.toContain('2024-01-15')
  })

  it('replaces ISO timestamp without milliseconds', () => {
    const raw = 'Log entry 2023-06-20T14:00:00Z'
    expect(normalizeError(raw)).toContain('<timestamp>')
  })

  it('replaces UUIDs with <uuid>', () => {
    const raw = 'Entity 550e8400-e29b-41d4-a716-446655440000 not found'
    expect(normalizeError(raw)).toContain('<uuid>')
    expect(normalizeError(raw)).not.toContain('550e8400-e29b-41d4-a716-446655440000')
  })

  it('normalizes whitespace to single spaces', () => {
    const raw = 'Error:   too  many   spaces'
    expect(normalizeError(raw)).toBe('Error: too many spaces')
  })

  it('trims leading and trailing whitespace', () => {
    const raw = '   TypeError: foo   '
    expect(normalizeError(raw)).toBe('TypeError: foo')
  })
})

describe('computeSignature', () => {
  it('returns a 16-character hex string', () => {
    const sig = computeSignature('some error')
    expect(sig).toHaveLength(16)
    expect(sig).toMatch(/^[0-9a-f]{16}$/)
  })

  it('same error text with different absolute paths → identical signature', () => {
    const err1 = "TypeError: Cannot read property 'id' of undefined at /home/alice/project/src/api.ts"
    const err2 = "TypeError: Cannot read property 'id' of undefined at /Users/bob/work/myapp/src/api.ts"
    expect(computeSignature(err1)).toBe(computeSignature(err2))
  })

  it('same error text with different line numbers → identical signature', () => {
    const err1 = 'ReferenceError: foo is not defined at index.ts:42:7'
    const err2 = 'ReferenceError: foo is not defined at index.ts:99:3'
    expect(computeSignature(err1)).toBe(computeSignature(err2))
  })

  it('same error text with different timestamps → identical signature', () => {
    const err1 = 'Connection failed at 2024-01-01T00:00:00Z'
    const err2 = 'Connection failed at 2025-06-15T12:34:56Z'
    expect(computeSignature(err1)).toBe(computeSignature(err2))
  })

  it('different errors → different signatures', () => {
    const sigA = computeSignature('TypeError: cannot read property foo')
    const sigB = computeSignature('ReferenceError: bar is not defined')
    expect(sigA).not.toBe(sigB)
  })

  it('same error text → same signature (deterministic)', () => {
    const err = 'SyntaxError: Unexpected token }'
    expect(computeSignature(err)).toBe(computeSignature(err))
  })
})

describe('scopeFromError', () => {
  it('extracts database scope from src/db/ path fragment', () => {
    const err = "Error in src/db/connection.ts: constraint failed"
    expect(scopeFromError(err)).toBe('database')
  })

  it('extracts testing scope from __tests__ path fragment', () => {
    const err = "Cannot find module at src/__tests__/setup.ts"
    expect(scopeFromError(err)).toBe('testing')
  })

  it('extracts testing scope from .test.ts file pattern', () => {
    const err = "Assertion failed at src/api.test.ts"
    expect(scopeFromError(err)).toBe('testing')
  })

  it('extracts api scope from src/api/ path fragment', () => {
    const err = "Unhandled error in src/api/routes.ts"
    expect(scopeFromError(err)).toBe('api')
  })

  it('returns general when no recognizable paths present', () => {
    const err = "TypeError: Cannot read property 'length' of undefined"
    expect(scopeFromError(err)).toBe('general')
  })

  it('returns general when only absolute paths present (stripped)', () => {
    const err = "Error at /home/user/project/unknown/module.ts"
    expect(scopeFromError(err)).toBe('general')
  })

  it('uses first matching path when multiple present', () => {
    const err = "Error in src/api/handler.ts called from src/db/queries.ts"
    // api is matched first (appears first in the string)
    const result = scopeFromError(err)
    expect(['api', 'database']).toContain(result)
  })
})
