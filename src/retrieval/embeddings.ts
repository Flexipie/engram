export interface EmbeddingService {
  embed(text: string): Promise<Float32Array | null>
  available(): boolean
}

export class OllamaEmbeddingService implements EmbeddingService {
  constructor(
    private url: string,
    private model: string,
  ) {}

  available(): boolean {
    return true
  }

  async embed(text: string): Promise<Float32Array | null> {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10_000)
      const res = await fetch(`${this.url}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt: text }),
        signal: controller.signal,
      })
      clearTimeout(timeout)
      if (!res.ok) return null
      const json = (await res.json()) as { embedding?: number[] }
      if (!json.embedding || !Array.isArray(json.embedding)) return null
      return new Float32Array(json.embedding)
    } catch {
      return null
    }
  }
}

export class NoopEmbeddingService implements EmbeddingService {
  available(): boolean {
    return false
  }
  embed(): Promise<null> {
    return Promise.resolve(null)
  }
}

export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let magA = 0
  let magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  return denom === 0 ? 0 : dot / denom
}

export function serializeEmbedding(v: Float32Array): Buffer {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength)
}

export function deserializeEmbedding(b: Buffer): Float32Array {
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4)
}
