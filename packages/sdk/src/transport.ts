import { EngramApiError, EngramError } from './errors.js'

export interface TransportOptions {
  baseUrl: string
  apiKey?: string
  defaultWorktree: string
}

export class Transport {
  readonly baseUrl: string
  readonly apiKey: string | undefined
  readonly defaultWorktree: string

  constructor(opts: TransportOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '')
    this.apiKey = opts.apiKey
    this.defaultWorktree = opts.defaultWorktree
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.apiKey) h['Authorization'] = `Bearer ${this.apiKey}`
    return h
  }

  private url(path: string, query?: Record<string, unknown>): string {
    const u = new URL(this.baseUrl + path)
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) u.searchParams.set(k, String(v))
      }
    }
    return u.toString()
  }

  private async send<T>(url: string, init: RequestInit): Promise<T> {
    let res: Response
    try {
      res = await fetch(url, init)
    } catch (err) {
      throw new EngramError(`Network error: ${err instanceof Error ? err.message : String(err)}`)
    }
    let body: unknown
    try {
      body = await res.json()
    } catch {
      throw new EngramError(`Server returned non-JSON response (HTTP ${res.status})`)
    }
    if (!res.ok) {
      throw new EngramApiError(res.status, body, `HTTP ${res.status}: ${JSON.stringify(body)}`)
    }
    return body as T
  }

  async get<T>(path: string, query?: Record<string, unknown>): Promise<T> {
    return this.send<T>(this.url(path, query), {
      method: 'GET',
      headers: this.headers(),
    })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.send<T>(this.url(path), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body ?? {}),
    })
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.send<T>(this.url(path), {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify(body ?? {}),
    })
  }

  async delete<T>(path: string, body?: unknown): Promise<T> {
    return this.send<T>(this.url(path), {
      method: 'DELETE',
      headers: this.headers(),
      body: JSON.stringify(body ?? {}),
    })
  }
}
