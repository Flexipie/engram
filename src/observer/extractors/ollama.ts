import { buildPrompt, parseExtractionResponse, filterExisting } from '../extractor.js'
import type { ExtractionContext, ExtractedMemory, ExtractionEngine } from '../extractor.js'
import { logger } from '../../logger.js'

interface OllamaConfig {
  url: string       // e.g. http://localhost:11434
  model: string     // e.g. llama3.2
}

interface OllamaResponse {
  message?: { content: string }
  response?: string  // older API
}

export class OllamaExtractor implements ExtractionEngine {
  constructor(private readonly config: OllamaConfig) {}

  async extract(context: ExtractionContext): Promise<ExtractedMemory[]> {
    if (context.events.length === 0) return []

    const prompt = buildPrompt(context)

    let raw: string
    try {
      raw = await this.callOllama(prompt)
    } catch (err) {
      logger.warn('Observer: Ollama call failed', err)
      return []
    }

    const parsed = parseExtractionResponse(raw)
    return filterExisting(parsed, context.existingMemories)
  }

  private async callOllama(prompt: string): Promise<string> {
    const body = {
      model: this.config.model,
      messages: [{ role: 'user', content: prompt }],
      format: 'json',
      stream: false,
    }

    let response: Response
    try {
      response = await fetch(`${this.config.url}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      })
    } catch (err) {
      throw new Error(`Ollama unreachable at ${this.config.url}: ${String(err)}`)
    }

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}`)
    }

    const data = await response.json() as OllamaResponse
    const content = data.message?.content ?? data.response ?? ''

    if (!content) {
      // Retry once with plain generate endpoint
      return this.callGenerate(prompt)
    }

    return content
  }

  private async callGenerate(prompt: string): Promise<string> {
    const body = { model: this.config.model, prompt, format: 'json', stream: false }
    const response = await fetch(`${this.config.url}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    })
    if (!response.ok) throw new Error(`Ollama /api/generate returned ${response.status}`)
    const data = await response.json() as OllamaResponse
    return data.response ?? ''
  }
}
