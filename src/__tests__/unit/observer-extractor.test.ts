import { describe, it, expect } from 'vitest'
import { buildPrompt, parseExtractionResponse, filterExisting } from '../../observer/extractor.js'
import type { ToolEvent, ExtractionContext, ExtractedMemory } from '../../observer/extractor.js'

function makeEvent(tool: string, file_path: string, exit_status = 0): ToolEvent {
  return { tool, file_path, exit_status, timestamp: new Date().toISOString() }
}

describe('buildPrompt', () => {
  it('includes task context when present', () => {
    const ctx: ExtractionContext = {
      events: [makeEvent('Write', 'src/api/handler.ts')],
      task: { title: 'Add auth', goal: 'Implement JWT auth' },
      existingMemories: [],
    }
    const prompt = buildPrompt(ctx)
    expect(prompt).toContain('Add auth')
    expect(prompt).toContain('Implement JWT auth')
  })

  it('handles missing task context gracefully', () => {
    const ctx: ExtractionContext = {
      events: [makeEvent('Write', 'src/db/users.ts')],
      task: null,
      existingMemories: [],
    }
    const prompt = buildPrompt(ctx)
    expect(prompt).toContain('src/db/users.ts')
    expect(typeof prompt).toBe('string')
  })

  it('includes tool events in readable format', () => {
    const ctx: ExtractionContext = {
      events: [
        makeEvent('Write', 'src/api/routes.ts'),
        makeEvent('Bash', 'npm test', 0),
        makeEvent('Read', 'src/config.ts'),
      ],
      task: null,
      existingMemories: [],
    }
    const prompt = buildPrompt(ctx)
    expect(prompt).toContain('Write')
    expect(prompt).toContain('src/api/routes.ts')
    expect(prompt).toContain('Bash')
    expect(prompt).toContain('npm test')
  })

  it('includes existing memories to prevent duplication', () => {
    const ctx: ExtractionContext = {
      events: [makeEvent('Write', 'src/api/handler.ts')],
      task: null,
      existingMemories: [
        { content: 'Use Zod for validation', scope: 'api', type: 'convention' },
      ],
    }
    const prompt = buildPrompt(ctx)
    expect(prompt).toContain('Use Zod for validation')
  })

  it('instructs model to return valid JSON schema', () => {
    const ctx: ExtractionContext = { events: [], task: null, existingMemories: [] }
    const prompt = buildPrompt(ctx)
    expect(prompt).toContain('"memories"')
  })

  it('truncates Bash commands for privacy', () => {
    const longCmd = 'A'.repeat(200)
    const ctx: ExtractionContext = {
      events: [makeEvent('Bash', longCmd)],
      task: null,
      existingMemories: [],
    }
    const prompt = buildPrompt(ctx)
    // The prompt should not contain the full 200-char string
    expect(prompt).not.toContain('A'.repeat(200))
  })
})

describe('parseExtractionResponse', () => {
  it('parses valid JSON with memories', () => {
    const raw = JSON.stringify({
      memories: [
        { content: 'Use Zod', type: 'convention', scope: 'api', reasoning: 'zod imported everywhere' },
      ],
    })
    const result = parseExtractionResponse(raw)
    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('Use Zod')
    expect(result[0].type).toBe('convention')
    expect(result[0].scope).toBe('api')
  })

  it('returns empty array for empty memories', () => {
    const raw = JSON.stringify({ memories: [] })
    expect(parseExtractionResponse(raw)).toEqual([])
  })

  it('returns empty array for invalid JSON', () => {
    expect(parseExtractionResponse('not json')).toEqual([])
  })

  it('returns empty array for wrong shape', () => {
    expect(parseExtractionResponse(JSON.stringify({ result: 'something' }))).toEqual([])
  })

  it('skips entries with missing required fields', () => {
    const raw = JSON.stringify({
      memories: [
        { content: 'valid', type: 'convention', scope: 'api', reasoning: 'r' },
        { type: 'convention', scope: 'api' }, // missing content
        { content: 'also valid', type: 'decision', scope: 'general', reasoning: 'r' },
      ],
    })
    const result = parseExtractionResponse(raw)
    expect(result).toHaveLength(2)
  })

  it('accepts all valid memory types', () => {
    for (const type of ['convention', 'decision', 'anti_pattern'] as const) {
      const raw = JSON.stringify({ memories: [{ content: 'x', type, scope: 'api', reasoning: 'r' }] })
      const result = parseExtractionResponse(raw)
      expect(result[0].type).toBe(type)
    }
  })
})

describe('filterExisting', () => {
  const existing = [
    { content: 'Use Zod for validation', scope: 'api', type: 'convention' },
    { content: 'Never mock the database', scope: 'testing', type: 'anti_pattern' },
  ]

  it('removes memories with identical content', () => {
    const candidates: ExtractedMemory[] = [
      { content: 'Use Zod for validation', type: 'convention', scope: 'api', reasoning: 'r' },
    ]
    expect(filterExisting(candidates, existing)).toHaveLength(0)
  })

  it('keeps memories with different content', () => {
    const candidates: ExtractedMemory[] = [
      { content: 'Always use TypeScript strict mode', type: 'convention', scope: 'build', reasoning: 'r' },
    ]
    expect(filterExisting(candidates, existing)).toHaveLength(1)
  })

  it('filters case-insensitively', () => {
    const candidates: ExtractedMemory[] = [
      { content: 'use zod for validation', type: 'convention', scope: 'api', reasoning: 'r' },
    ]
    expect(filterExisting(candidates, existing)).toHaveLength(0)
  })

  it('handles empty candidates', () => {
    expect(filterExisting([], existing)).toEqual([])
  })

  it('handles empty existing', () => {
    const candidates: ExtractedMemory[] = [
      { content: 'something new', type: 'convention', scope: 'api', reasoning: 'r' },
    ]
    expect(filterExisting(candidates, [])).toHaveLength(1)
  })
})
