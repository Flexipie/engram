import { buildPrompt, parseExtractionResponse, filterExisting } from '../extractor.js'
import type { ExtractionContext, ExtractedMemory, ExtractionEngine } from '../extractor.js'
import { logger } from '../../logger.js'

interface HaikuConfig {
  apiKey: string
  model?: string  // default: claude-haiku-4-5-20251001
}

export class HaikuExtractor implements ExtractionEngine {
  private readonly model: string

  constructor(private readonly config: HaikuConfig) {
    this.model = config.model ?? 'claude-haiku-4-5-20251001'
  }

  async extract(context: ExtractionContext): Promise<ExtractedMemory[]> {
    if (context.events.length === 0) return []

    const prompt = buildPrompt(context)

    let raw: string
    try {
      raw = await this.callAnthropic(prompt)
    } catch (err) {
      logger.warn('Observer: Haiku call failed', err)
      return []
    }

    const parsed = parseExtractionResponse(raw)
    return filterExisting(parsed, context.existingMemories)
  }

  private async callAnthropic(prompt: string): Promise<string> {
    const body = {
      model: this.model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Anthropic API ${response.status}: ${text.slice(0, 200)}`)
    }

    const data = await response.json() as { content: Array<{ type: string; text: string }> }
    return data.content?.find(b => b.type === 'text')?.text ?? ''
  }
}
