import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb, teardownDb } from '../setup.js'
import { insertMemory, updateMemoryEmbedding } from '../../db/memories.js'
import { handleRemember, handleRecall } from '../../mcp/handlers/memory.js'
import { serializeEmbedding } from '../../retrieval/embeddings.js'
import type { EmbeddingService } from '../../retrieval/embeddings.js'
import type { ContextPacket } from '../../retrieval/context-packet.js'

// Mock embedding service that returns deterministic embeddings
function makeEmbeddingService(embeddings: Map<string, Float32Array>): EmbeddingService {
  return {
    available: () => true,
    embed: async (text: string) => embeddings.get(text) ?? new Float32Array(3).fill(0),
  }
}

function makeNoop(): EmbeddingService {
  return {
    available: () => false,
    embed: async () => null,
  }
}

describe('semantic recall — hybrid reranking', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    teardownDb(db)
  })

  it('returns memories ranked by cosine similarity when service available', async () => {
    // Use high confidence so memories clear the 0.4 score threshold.
    // Memory 1 will have high vector similarity to query; memory 2 will have zero.
    const id1 = insertMemory(db, {
      type: 'convention', scope: 'general', content: 'use Zod for validation', confidence: 0.9,
    })
    const id2 = insertMemory(db, {
      type: 'convention', scope: 'general', content: 'prefer named exports', confidence: 0.9,
    })

    // Memory 1: identical to query embedding → vectorSim = 1.0
    // Memory 2: orthogonal to query embedding → vectorSim = 0.0
    updateMemoryEmbedding(db, id1, serializeEmbedding(new Float32Array([1, 0, 0])))
    updateMemoryEmbedding(db, id2, serializeEmbedding(new Float32Array([0, 1, 0])))

    const queryEmbedding = new Float32Array([1, 0, 0])
    const embeddings = new Map([['schema validation', queryEmbedding]])
    const svc = makeEmbeddingService(embeddings)

    const result = await handleRecall(db, null, { query: 'schema validation' }, svc) as ContextPacket
    const allMemories = [...result.critical, ...result.relevant, ...result.antipatterns]

    // id1 must appear (high vector sim pulls it above threshold)
    const idx1 = allMemories.findIndex((m) => m.id === id1)
    expect(idx1).toBeGreaterThanOrEqual(0)

    // If id2 also appears, it must rank after id1
    const idx2 = allMemories.findIndex((m) => m.id === id2)
    if (idx2 >= 0) {
      expect(idx1).toBeLessThan(idx2)
    }
  })

  it('falls back to FTS ranking when no embedding service', async () => {
    // Use high confidence + general scope so score clears the 0.4 threshold
    insertMemory(db, {
      type: 'convention', scope: 'general', content: 'always validate inputs', confidence: 0.9,
    })
    const result = await handleRecall(db, null, { query: 'validate' }, makeNoop()) as ContextPacket
    const all = [...result.critical, ...result.relevant]
    expect(all.length).toBeGreaterThan(0)
  })

  it('returns all memories without query even when service available', async () => {
    insertMemory(db, { type: 'convention', scope: 'general', content: 'use Zod', confidence: 0.9 })
    const svc = makeEmbeddingService(new Map())
    const result = await handleRecall(db, null, {}, svc) as ContextPacket
    const all = [...result.critical, ...result.relevant]
    expect(all.length).toBeGreaterThan(0)
  })
})

describe('contradiction detection', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    teardownDb(db)
  })

  it('detects contradiction when cosine sim >= threshold', async () => {
    // First memory — store with embedding [1, 0, 0]
    const embeddings = new Map([
      ['always validate with Zod', new Float32Array([1, 0, 0])],
      ['never use Zod, use joi', new Float32Array([0.99, 0.1, 0])],
    ])
    const svc = makeEmbeddingService(embeddings)

    // Store first memory
    await handleRemember(db, null, {
      content: 'always validate with Zod',
      type: 'convention',
      scope: 'api',
    }, svc, 0.85)

    // Store conflicting memory — high similarity to first
    const result = await handleRemember(db, null, {
      content: 'never use Zod, use joi',
      type: 'anti_pattern',
      scope: 'api',
    }, svc, 0.85)

    expect(result).toHaveProperty('contradicts_with')
    expect(result.contradicts_with!.length).toBeGreaterThan(0)
    expect(result.contradicts_with![0].similarity).toBeGreaterThanOrEqual(0.85)
  })

  it('no contradiction warning when similarity below threshold', async () => {
    const embeddings = new Map([
      ['use Zod for validation', new Float32Array([1, 0, 0])],
      ['prefer functional components', new Float32Array([0, 1, 0])],
    ])
    const svc = makeEmbeddingService(embeddings)

    await handleRemember(db, null, {
      content: 'use Zod for validation',
      type: 'convention',
      scope: 'api',
    }, svc, 0.85)

    const result = await handleRemember(db, null, {
      content: 'prefer functional components',
      type: 'convention',
      scope: 'components',
    }, svc, 0.85)

    expect(result.contradicts_with).toBeUndefined()
  })

  it('no contradiction check when service unavailable', async () => {
    const result = await handleRemember(db, null, {
      content: 'use Zod',
      type: 'convention',
      scope: 'api',
    }, makeNoop(), 0.85)

    expect(result.contradicts_with).toBeUndefined()
    expect(result.id).toBeDefined()
  })
})
