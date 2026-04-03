import { describe, it, expect } from 'vitest'
import {
  cosine,
  serializeEmbedding,
  deserializeEmbedding,
  NoopEmbeddingService,
  OllamaEmbeddingService,
} from '../../retrieval/embeddings.js'

describe('cosine()', () => {
  it('returns 1.0 for identical vectors', () => {
    const v = new Float32Array([1, 2, 3])
    expect(cosine(v, v)).toBeCloseTo(1.0, 5)
  })

  it('returns 0 for orthogonal vectors', () => {
    const a = new Float32Array([1, 0, 0])
    const b = new Float32Array([0, 1, 0])
    expect(cosine(a, b)).toBeCloseTo(0, 5)
  })

  it('returns -1.0 for opposite vectors', () => {
    const a = new Float32Array([1, 0])
    const b = new Float32Array([-1, 0])
    expect(cosine(a, b)).toBeCloseTo(-1.0, 5)
  })

  it('returns 0 for zero-length vectors', () => {
    const a = new Float32Array([0, 0])
    const b = new Float32Array([1, 1])
    expect(cosine(a, b)).toBe(0)
  })

  it('returns 0 for mismatched lengths', () => {
    const a = new Float32Array([1, 2])
    const b = new Float32Array([1, 2, 3])
    expect(cosine(a, b)).toBe(0)
  })

  it('handles similar (but not identical) vectors', () => {
    const a = new Float32Array([1, 2, 3])
    const b = new Float32Array([1, 2, 4])
    const sim = cosine(a, b)
    expect(sim).toBeGreaterThan(0.9)
    expect(sim).toBeLessThan(1.0)
  })
})

describe('serializeEmbedding / deserializeEmbedding', () => {
  it('round-trips correctly', () => {
    const original = new Float32Array([0.1, 0.2, 0.3, -0.4])
    const buf = serializeEmbedding(original)
    const restored = deserializeEmbedding(buf)
    expect(restored.length).toBe(original.length)
    for (let i = 0; i < original.length; i++) {
      expect(restored[i]).toBeCloseTo(original[i], 5)
    }
  })

  it('serialize returns a Buffer', () => {
    const v = new Float32Array([1, 2])
    expect(Buffer.isBuffer(serializeEmbedding(v))).toBe(true)
  })

  it('byte length is 4x float count', () => {
    const v = new Float32Array([1, 2, 3])
    const buf = serializeEmbedding(v)
    expect(buf.byteLength).toBe(12)
  })
})

describe('NoopEmbeddingService', () => {
  it('available() returns false', () => {
    const svc = new NoopEmbeddingService()
    expect(svc.available()).toBe(false)
  })

  it('embed() resolves null', async () => {
    const svc = new NoopEmbeddingService()
    expect(await svc.embed('any text')).toBeNull()
  })
})

describe('OllamaEmbeddingService', () => {
  it('available() returns true', () => {
    const svc = new OllamaEmbeddingService('http://localhost:11434', 'nomic-embed-text')
    expect(svc.available()).toBe(true)
  })

  it('embed() returns null when server unreachable', async () => {
    // Use a port that is definitely not listening
    const svc = new OllamaEmbeddingService('http://localhost:1', 'nomic-embed-text')
    const result = await svc.embed('test')
    expect(result).toBeNull()
  })
})
