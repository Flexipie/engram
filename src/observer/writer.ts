import { logger } from '../logger.js'
import type { ExtractedMemory } from './extractor.js'

export interface MemoryWriter {
  write(memory: ExtractedMemory): Promise<void>
  fetchExisting(query: string): Promise<Array<{ content: string; scope: string; type: string }>>
  fetchActiveTask(worktree: string): Promise<{ title: string; goal: string } | null>
}

export class RestApiWriter implements MemoryWriter {
  constructor(
    private readonly baseUrl: string,
    private readonly worktree?: string,
    private readonly apiKey?: string,
  ) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.apiKey) h['Authorization'] = `Bearer ${this.apiKey}`
    return h
  }

  private worktreeParam(): string {
    return this.worktree ? `?worktree=${encodeURIComponent(this.worktree)}` : ''
  }

  async write(memory: ExtractedMemory): Promise<void> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/memories${this.worktreeParam()}`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          type: memory.type,
          scope: memory.scope,
          content: memory.content,
          confidence: 0.4,
          source: 'observer',
        }),
        signal: AbortSignal.timeout(5_000),
      })
      if (!res.ok) {
        logger.warn('Observer writer: failed to write memory', { status: res.status, content: memory.content.slice(0, 50) })
      }
    } catch (err) {
      logger.warn('Observer writer: network error', err)
    }
  }

  async fetchExisting(query: string): Promise<Array<{ content: string; scope: string; type: string }>> {
    try {
      const params = new URLSearchParams({ query, limit: '20' })
      if (this.worktree) params.set('worktree', this.worktree)
      const res = await fetch(`${this.baseUrl}/v1/memories?${params.toString()}`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(5_000),
      })
      if (!res.ok) return []
      const data = await res.json() as { memories: Array<{ content: string; scope: string; type: string }> }
      return data.memories ?? []
    } catch {
      return []
    }
  }

  async fetchActiveTask(worktree: string): Promise<{ title: string; goal: string } | null> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/sessions/current?worktree=${encodeURIComponent(worktree)}`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(5_000),
      })
      if (!res.ok) return null
      const data = await res.json() as { task?: { title: string; goal: string } }
      if (!data.task) return null
      return { title: data.task.title, goal: data.task.goal }
    } catch {
      return null
    }
  }
}
