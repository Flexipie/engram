import Database from 'better-sqlite3'
import { z } from 'zod'
import { checkConventions, type EnforcementConfig, type EnforcementResult } from '../../enforcement/checker.js'
import { MEMORY_SCOPES } from '../../db/memories.js'

const CheckConventionsSchema = z.object({
  file_path: z.string().describe('Path of the file about to be written'),
  content: z.string().optional().describe('File content (reserved — not used in Phase 5)'),
  scope: z.enum(MEMORY_SCOPES).optional().describe('Scope override (auto-detected from path if omitted)'),
})

export async function handleCheckConventions(
  db: Database.Database,
  config: EnforcementConfig,
  params: unknown,
): Promise<EnforcementResult> {
  const data = CheckConventionsSchema.parse(params)
  return checkConventions(db, data.file_path, config, data.scope)
}
