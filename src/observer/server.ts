import express from 'express'
import { EventBuffer, type ToolEvent } from './buffer.js'
import type { ExtractionEngine, ExtractionContext } from './extractor.js'
import type { MemoryWriter } from './writer.js'
import { logger } from '../logger.js'

export interface ObserverAppConfig {
  extractor: ExtractionEngine
  writer: MemoryWriter
  batchSize: number
  flushIntervalMs: number
  worktree?: string
}

export function createObserverApp(config: ObserverAppConfig): express.Express {
  const app = express()
  app.use(express.json())

  let lastFlush: string | null = null

  const doFlush = async (events: ToolEvent[]): Promise<void> => {
    lastFlush = new Date().toISOString()
    logger.info(`Observer: flushing ${events.length} events`)

    // Fetch context for the extraction
    const worktree = config.worktree ?? process.cwd()
    const [task, existingMemories] = await Promise.all([
      config.writer.fetchActiveTask(worktree),
      // Use the most common file in events as a recall query
      config.writer.fetchExisting(events[0]?.file_path ?? ''),
    ])

    const context: ExtractionContext = { events, task, existingMemories }
    const extracted = await config.extractor.extract(context)

    logger.info(`Observer: extracted ${extracted.length} memories`)

    for (const memory of extracted) {
      await config.writer.write(memory)
    }
  }

  const buffer = new EventBuffer(config.batchSize, config.flushIntervalMs, (events) => {
    doFlush(events).catch(err => logger.error('Observer flush error', err))
  })

  // Store buffer on app for testing
  ;(app as express.Express & { _buffer: EventBuffer })._buffer = buffer

  // GET /health
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      buffer_size: buffer.size(),
      last_flush: lastFlush,
    })
  })

  // POST /event — receive a tool event
  app.post('/event', (req, res): void => {
    const { tool, file_path, exit_status } = req.body as {
      tool?: string
      file_path?: string
      exit_status?: number
    }

    if (!tool || typeof tool !== 'string') {
      res.status(400).json({ error: 'tool is required' })
      return
    }

    const event: ToolEvent = {
      tool,
      file_path: typeof file_path === 'string' ? file_path.slice(0, 200) : '',
      exit_status: typeof exit_status === 'number' ? exit_status : 0,
      timestamp: new Date().toISOString(),
    }

    buffer.add(event)

    res.json({ ok: true, buffer_size: buffer.size() })
  })

  // POST /flush — manual trigger
  app.post('/flush', (_req, res) => {
    buffer.flush()
    res.json({ ok: true })
  })

  return app
}
