import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb, teardownDb } from '../setup.js'
import { handleCheckError, handleRecordError } from '../../mcp/handlers/error.js'
import { computeSignature } from '../../errors/normalizer.js'

describe('error handlers', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    teardownDb(db)
  })

  describe('handleCheckError', () => {
    it('returns { found: false, signature } for unknown error', async () => {
      const result = await handleCheckError(db, {
        error_raw: "TypeError: Cannot read property 'id' of undefined",
      })
      expect(result.found).toBe(false)
      expect(result.signature).toHaveLength(16)
      expect(result.signature).toMatch(/^[0-9a-f]{16}$/)
    })

    it('returns { found: true } with fix after record_error', async () => {
      const errorRaw = "TypeError: Cannot read property 'name' of undefined"
      await handleRecordError(db, {
        error_raw: errorRaw,
        cause: 'Forgot null check',
        fix: 'Add null guard before accessing .name',
      })

      const result = await handleCheckError(db, { error_raw: errorRaw })
      expect(result.found).toBe(true)
      if (result.found) {
        expect(result.fix).toBe('Add null guard before accessing .name')
        expect(result.cause).toBe('Forgot null check')
        expect(result.recurrence).toBeGreaterThanOrEqual(1)
      }
    })

    it('increments recurrence on each check hit', async () => {
      const errorRaw = 'ReferenceError: foo is not defined'
      await handleRecordError(db, { error_raw: errorRaw, fix: 'Define foo before use' })

      await handleCheckError(db, { error_raw: errorRaw })
      const result = await handleCheckError(db, { error_raw: errorRaw })

      expect(result.found).toBe(true)
      if (result.found) {
        // initial insert: recurrence=1, check1 → 2, check2 → 3
        expect(result.recurrence).toBe(3)
      }
    })

    it('matches same error with different absolute paths (signature collision)', async () => {
      const errLinux = "TypeError: Cannot read 'x' at /home/alice/project/src/util.ts:10:5"
      const errMac = "TypeError: Cannot read 'x' at /Users/bob/work/myapp/src/util.ts:10:5"

      await handleRecordError(db, {
        error_raw: errLinux,
        fix: 'Check for undefined before access',
      })

      const result = await handleCheckError(db, { error_raw: errMac })
      expect(result.found).toBe(true)
      if (result.found) {
        expect(result.fix).toBe('Check for undefined before access')
      }
    })

    it('returns last_seen and scope on hit', async () => {
      const errorRaw = 'SyntaxError: Unexpected token in src/api/handler.ts'
      await handleRecordError(db, { error_raw: errorRaw, fix: 'Fix syntax' })

      const result = await handleCheckError(db, { error_raw: errorRaw })
      expect(result.found).toBe(true)
      if (result.found) {
        expect(result.last_seen).toBeTruthy()
        expect(result.scope).toBeTruthy()
      }
    })
  })

  describe('handleRecordError', () => {
    it('inserts new error and returns { recurrence: 1, updated: false }', async () => {
      const result = await handleRecordError(db, {
        error_raw: 'Cannot find module ./missing',
        fix: 'Run npm install',
      })

      expect(result.id).toBeTruthy()
      expect(result.signature).toHaveLength(16)
      expect(result.recurrence).toBe(1)
      expect(result.updated).toBe(false)
    })

    it('stores fix as null when not provided', async () => {
      const result = await handleRecordError(db, {
        error_raw: 'Unknown error occurred',
      })

      const row = db.prepare('SELECT fix FROM error_patterns WHERE id = ?').get(result.id) as { fix: string | null }
      expect(row.fix).toBeNull()
    })

    it('upserts on existing signature: updated: true, recurrence incremented', async () => {
      const errorRaw = 'ECONNREFUSED 127.0.0.1:5432'

      const first = await handleRecordError(db, {
        error_raw: errorRaw,
        fix: 'Start the database',
      })
      expect(first.recurrence).toBe(1)
      expect(first.updated).toBe(false)

      const second = await handleRecordError(db, {
        error_raw: errorRaw,
        fix: 'Start PostgreSQL with: pg_ctl start',
      })
      expect(second.updated).toBe(true)
      expect(second.recurrence).toBe(2)
      expect(second.id).toBe(first.id)
    })

    it('updates fix on upsert when new fix provided', async () => {
      const errorRaw = 'Cannot find module @/utils'

      await handleRecordError(db, { error_raw: errorRaw, fix: 'old fix' })
      await handleRecordError(db, { error_raw: errorRaw, fix: 'better fix' })

      const row = db.prepare(
        'SELECT fix FROM error_patterns WHERE signature = ?'
      ).get(computeSignature(errorRaw)) as { fix: string }
      expect(row.fix).toBe('better fix')
    })

    it('does not overwrite fix with empty string on upsert', async () => {
      const errorRaw = 'Module not found: react'

      await handleRecordError(db, { error_raw: errorRaw, fix: 'npm install react' })
      await handleRecordError(db, { error_raw: errorRaw })

      const row = db.prepare(
        'SELECT fix FROM error_patterns WHERE signature = ?'
      ).get(computeSignature(errorRaw)) as { fix: string }
      expect(row.fix).toBe('npm install react')
    })

    it('uses explicit scope when provided', async () => {
      const result = await handleRecordError(db, {
        error_raw: 'Some error without path info',
        scope: 'api',
      })

      const row = db.prepare('SELECT scope FROM error_patterns WHERE id = ?').get(result.id) as { scope: string }
      expect(row.scope).toBe('api')
    })

    it('auto-detects scope from path fragments in error text', async () => {
      const result = await handleRecordError(db, {
        error_raw: 'Error thrown in src/db/queries.ts at line 12',
      })

      const row = db.prepare('SELECT scope FROM error_patterns WHERE id = ?').get(result.id) as { scope: string }
      expect(row.scope).toBe('database')
    })

    it('falls back to general scope when no path fragments found', async () => {
      const result = await handleRecordError(db, {
        error_raw: "TypeError: Cannot read property 'x' of null",
      })

      const row = db.prepare('SELECT scope FROM error_patterns WHERE id = ?').get(result.id) as { scope: string }
      expect(row.scope).toBe('general')
    })
  })
})
