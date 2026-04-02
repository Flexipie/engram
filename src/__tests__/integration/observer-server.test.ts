import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { createObserverApp } from '../../observer/server.js'
import type { ExtractionEngine, ExtractedMemory } from '../../observer/extractor.js'
import type { MemoryWriter } from '../../observer/writer.js'

// Null extractor — returns nothing
const nullExtractor: ExtractionEngine = {
  extract: async () => [],
}

// Capturing extractor — records calls
function makeCaptureExtractor(): ExtractionEngine & { calls: unknown[] } {
  const calls: unknown[] = []
  return {
    calls,
    extract: async (ctx) => { calls.push(ctx); return [] },
  }
}

// Null writer
const nullWriter: MemoryWriter = {
  write: async () => {},
  fetchExisting: async () => [],
  fetchActiveTask: async () => null,
}

describe('observer HTTP server', () => {
  it('GET /health returns status', async () => {
    const app = createObserverApp({ extractor: nullExtractor, writer: nullWriter, batchSize: 10, flushIntervalMs: 30000 })
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('status', 'ok')
    expect(res.body).toHaveProperty('buffer_size')
    expect(res.body).toHaveProperty('last_flush')
  })

  it('POST /event accepts valid tool event', async () => {
    const app = createObserverApp({ extractor: nullExtractor, writer: nullWriter, batchSize: 10, flushIntervalMs: 30000 })
    const res = await request(app).post('/event').send({
      tool: 'Write',
      file_path: 'src/api/handler.ts',
      exit_status: 0,
    })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.buffer_size).toBe(1)
  })

  it('POST /event returns 400 when tool is missing', async () => {
    const app = createObserverApp({ extractor: nullExtractor, writer: nullWriter, batchSize: 10, flushIntervalMs: 30000 })
    const res = await request(app).post('/event').send({ file_path: 'src/api/handler.ts' })
    expect(res.status).toBe(400)
  })

  it('POST /event increments buffer_size', async () => {
    const app = createObserverApp({ extractor: nullExtractor, writer: nullWriter, batchSize: 10, flushIntervalMs: 30000 })
    await request(app).post('/event').send({ tool: 'Write', file_path: 'a.ts', exit_status: 0 })
    await request(app).post('/event').send({ tool: 'Read', file_path: 'b.ts', exit_status: 0 })
    const res = await request(app).get('/health')
    expect(res.body.buffer_size).toBe(2)
  })

  it('POST /flush triggers extraction manually', async () => {
    const extractor = makeCaptureExtractor()
    const app = createObserverApp({ extractor, writer: nullWriter, batchSize: 100, flushIntervalMs: 99999 })
    await request(app).post('/event').send({ tool: 'Write', file_path: 'src/config.ts', exit_status: 0 })
    const res = await request(app).post('/flush')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    // Allow async flush to complete
    await new Promise(r => setTimeout(r, 50))
    expect(extractor.calls).toHaveLength(1)
  })

  it('auto-flushes when batchSize is reached', async () => {
    const extractor = makeCaptureExtractor()
    const app = createObserverApp({ extractor, writer: nullWriter, batchSize: 3, flushIntervalMs: 99999 })
    await request(app).post('/event').send({ tool: 'Write', file_path: 'a.ts', exit_status: 0 })
    await request(app).post('/event').send({ tool: 'Write', file_path: 'b.ts', exit_status: 0 })
    await request(app).post('/event').send({ tool: 'Write', file_path: 'c.ts', exit_status: 0 })
    // Allow async flush
    await new Promise(r => setTimeout(r, 50))
    expect(extractor.calls).toHaveLength(1)
  })

  it('GET /health shows last_flush after manual flush', async () => {
    const app = createObserverApp({ extractor: nullExtractor, writer: nullWriter, batchSize: 10, flushIntervalMs: 99999 })
    await request(app).post('/event').send({ tool: 'Write', file_path: 'a.ts', exit_status: 0 })
    await request(app).post('/flush')
    await new Promise(r => setTimeout(r, 50))
    const res = await request(app).get('/health')
    expect(res.body.last_flush).not.toBeNull()
  })
})
