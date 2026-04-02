import type { ToolEvent } from './buffer.js'
import { MEMORY_TYPES } from '../db/memories.js'

export type { ToolEvent }

export interface ExtractionContext {
  events: ToolEvent[]
  task: { title: string; goal: string } | null
  existingMemories: Array<{ content: string; scope: string; type: string }>
}

export interface ExtractedMemory {
  content: string
  type: 'convention' | 'decision' | 'anti_pattern'
  scope: string
  reasoning: string
}

export interface ExtractionEngine {
  extract(context: ExtractionContext): Promise<ExtractedMemory[]>
}

const VALID_TYPES = new Set(['convention', 'decision', 'anti_pattern'])

// Summarise tool events into a readable list, sanitising Bash commands
function formatEvents(events: ToolEvent[]): string {
  // Aggregate: count how many times each (tool, file_path) pair appears
  const counts = new Map<string, number>()
  for (const e of events) {
    const key = `${e.tool}|${e.file_path.slice(0, 100)}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const lines: string[] = []
  for (const [key, count] of counts) {
    const [tool, path] = key.split('|')
    const exitFailed = events.filter(e => e.tool === tool && e.file_path.startsWith(path) && e.exit_status !== 0).length
    const suffix = exitFailed > 0 ? ` (${exitFailed}x failed)` : count > 1 ? ` (${count}x)` : ''
    lines.push(`- ${tool}: ${path}${suffix}`)
  }

  return lines.join('\n')
}

export function buildPrompt(ctx: ExtractionContext): string {
  const taskBlock = ctx.task
    ? `TASK: "${ctx.task.title}"\nGOAL: "${ctx.task.goal}"`
    : 'TASK: (no active task)'

  const eventsBlock = ctx.events.length > 0
    ? formatEvents(ctx.events)
    : '(no events)'

  const existingBlock = ctx.existingMemories.length > 0
    ? ctx.existingMemories.map(m => `- [${m.scope}] ${m.content}`).join('\n')
    : '(none)'

  return `You are a code intelligence system. Analyse developer tool activity and extract ONLY repository-wide conventions or patterns that future coding sessions should know.

${taskBlock}

TOOL ACTIVITY:
${eventsBlock}

ALREADY KNOWN (do not duplicate):
${existingBlock}

RULES:
- Only extract repo-wide patterns (coding conventions, architecture decisions, anti-patterns).
- NEVER extract task-specific progress ("currently implementing X", "working on Y").
- NEVER duplicate existing memories.
- Return [] if nothing repo-wide is evident from this activity.
- Scope must be one of: auth, api, components, database, testing, config, general, build, types, utils, services, state, routing, infra, scripts.

Return ONLY this JSON (no markdown, no explanation):
{"memories":[{"content":"string","type":"convention|decision|anti_pattern","scope":"string","reasoning":"string"}]}`
}

export function parseExtractionResponse(raw: string): ExtractedMemory[] {
  try {
    // Strip markdown code fences if model adds them
    const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    const parsed = JSON.parse(cleaned) as unknown

    if (typeof parsed !== 'object' || parsed === null || !('memories' in parsed)) return []

    const arr = (parsed as { memories: unknown }).memories
    if (!Array.isArray(arr)) return []

    const results: ExtractedMemory[] = []
    for (const item of arr) {
      if (typeof item !== 'object' || item === null) continue
      const m = item as Record<string, unknown>
      if (
        typeof m['content'] === 'string' && m['content'].length > 0 &&
        typeof m['type'] === 'string' && VALID_TYPES.has(m['type']) &&
        typeof m['scope'] === 'string' && m['scope'].length > 0
      ) {
        results.push({
          content: m['content'],
          type: m['type'] as ExtractedMemory['type'],
          scope: m['scope'],
          reasoning: typeof m['reasoning'] === 'string' ? m['reasoning'] : '',
        })
      }
    }
    return results
  } catch {
    return []
  }
}

export function filterExisting(
  candidates: ExtractedMemory[],
  existing: Array<{ content: string }>,
): ExtractedMemory[] {
  const existingLower = new Set(existing.map(m => m.content.toLowerCase().trim()))
  return candidates.filter(c => !existingLower.has(c.content.toLowerCase().trim()))
}
