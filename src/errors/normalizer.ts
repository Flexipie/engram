import { createHash } from 'crypto'
import type { MemoryScope } from '../db/memories.js'

// Re-implement fileToScope locally — scope-detector.ts has the same logic
// but it's not exported and has async git dependencies we don't need here.
function fileToScope(filePath: string): string {
  if (/\.(test|spec)\.[a-z]+$/.test(filePath)) return 'testing'
  if (/__tests__\//.test(filePath)) return 'testing'
  if (/^src\/auth\//.test(filePath)) return 'auth'
  if (/^src\/api\//.test(filePath)) return 'api'
  if (/^src\/components\//.test(filePath)) return 'components'
  if (/^src\/ui\//.test(filePath)) return 'components'
  if (/^src\/db\//.test(filePath)) return 'database'
  if (/src\/[^/]*db[^/]*\//.test(filePath)) return 'database'
  if (/^src\/config\//.test(filePath)) return 'config'
  if (/\.config\.[a-z]+$/.test(filePath)) return 'config'
  return 'general'
}

export function normalizeError(raw: string): string {
  return raw
    // 1. Strip ANSI escape codes
    .replace(/\x1b\[[0-9;]*[mGKHF]/g, '')
    // 2. Strip absolute paths under known root prefixes
    .replace(/\/(?:home|Users|root|tmp|var|usr|opt|private)[^\s:'"()\]]+/g, '<path>')
    // 3. Strip remaining absolute-looking paths (2+ segments)
    .replace(/\/(?:[a-zA-Z0-9._-]+\/){2,}[^\s:'"()\]]+/g, '<path>')
    // 4. Strip line:col refs (e.g. file.ts:42:7 → file.ts)
    .replace(/:(\d+):(\d+)(?=\s|$|['")\]])/g, '')
    // 5. Strip hex memory addresses
    .replace(/\b0x[0-9a-fA-F]{4,}\b/g, '<addr>')
    // 6. Strip ISO timestamps
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g, '<timestamp>')
    // 7. Strip UUIDs
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    // 8. Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim()
}

export function computeSignature(raw: string): string {
  const normalized = normalizeError(raw)
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16)
}

export function scopeFromError(errorRaw: string): MemoryScope {
  const pathMatches = errorRaw.match(/(?:src|app|lib|test|tests|__tests__)\/[^\s:'"()\]]+/g) ?? []
  for (const p of pathMatches) {
    const scope = fileToScope(p)
    if (scope !== 'general') return scope as MemoryScope
  }
  return 'general'
}
