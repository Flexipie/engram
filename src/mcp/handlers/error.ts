import Database from 'better-sqlite3'
import { z } from 'zod'
import type { MemoryScope } from '../../db/memories.js'
import { lookupBySignature, upsertErrorPattern, incrementRecurrence } from '../../db/errors.js'
import { computeSignature, normalizeError, scopeFromError } from '../../errors/normalizer.js'

const CheckErrorSchema = z.object({
  error_raw: z.string().describe('The full error output'),
  scope: z.string().optional().describe('Scope hint (auto-detected if omitted)'),
})

const RecordErrorSchema = z.object({
  error_raw: z.string().describe('The full error output'),
  cause: z.string().optional().describe('What caused the error'),
  fix: z.string().optional().describe('What resolved it'),
  scope: z.string().optional().describe('Scope (auto-detected if omitted)'),
})

type CheckErrorParams = z.infer<typeof CheckErrorSchema>
type RecordErrorParams = z.infer<typeof RecordErrorSchema>

type CheckErrorResult =
  | { found: true; id: string; signature: string; cause: string | null; fix: string | null; recurrence: number; scope: string; last_seen: string }
  | { found: false; signature: string }

interface RecordErrorResult {
  id: string
  signature: string
  recurrence: number
  updated: boolean
}

export async function handleCheckError(
  db: Database.Database,
  params: CheckErrorParams,
): Promise<CheckErrorResult> {
  const { error_raw } = CheckErrorSchema.parse(params)

  const signature = computeSignature(error_raw)
  const existing = lookupBySignature(db, signature)

  if (existing) {
    incrementRecurrence(db, signature)
    // Re-fetch to get updated recurrence
    const updated = lookupBySignature(db, signature)!
    return {
      found: true,
      id: updated.id,
      signature: updated.signature,
      cause: updated.cause,
      fix: updated.fix,
      recurrence: updated.recurrence,
      scope: updated.scope,
      last_seen: updated.last_seen,
    }
  }

  return { found: false, signature }
}

export async function handleRecordError(
  db: Database.Database,
  params: RecordErrorParams,
): Promise<RecordErrorResult> {
  const { error_raw, cause, fix, scope: explicitScope } = RecordErrorSchema.parse(params)

  const signature = computeSignature(error_raw)
  const normalized = normalizeError(error_raw)
  const scope: MemoryScope = explicitScope ?? scopeFromError(error_raw)

  const { id, updated } = upsertErrorPattern(db, signature, {
    error_raw,
    error_normalized: normalized,
    cause,
    fix,
    scope,
  })

  const pattern = lookupBySignature(db, signature)!
  return {
    id,
    signature,
    recurrence: pattern.recurrence,
    updated,
  }
}
