import { describe, it, expect, vi } from 'vitest'
import { createAuthMiddleware } from '../../http/api/middleware/auth.js'
import type { EngramConfig } from '../../config.js'
import type { Request, Response, NextFunction } from 'express'
import { createHash } from 'crypto'

function mockReq(authHeader?: string): Partial<Request> {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
  }
}

type MockRes = Partial<Response> & { statusCode?: number; jsonData?: unknown }

function mockRes(): MockRes {
  const res: MockRes = {}
  res.status = (code: number) => {
    res.statusCode = code
    return res as unknown as Response
  }
  res.json = (data: unknown) => {
    res.jsonData = data
    return res as unknown as Response
  }
  return res
}

function makeConfig(overrides: Partial<EngramConfig> = {}): EngramConfig {
  return {
    port: 7337, maxMemories: 15, globalMemoryCap: 5,
    warnThreshold: 0.6, blockThreshold: 0.8, alwaysIncludeGlobal: false,
    minRecallConfidence: 0.4, domain: 'software', apiKeyRequired: false, apiKeys: [],
    observer: { enabled: false, model: 'ollama', ollamaUrl: 'http://localhost:11434', ollamaModel: 'llama3.2', batchSize: 10, flushIntervalMs: 30000, port: 7338 },
    ...overrides,
  }
}

describe('auth middleware', () => {
  it('calls next() immediately when apiKeyRequired is false', () => {
    const middleware = createAuthMiddleware(makeConfig({ apiKeyRequired: false }))
    const next = vi.fn()
    middleware(mockReq() as Request, mockRes() as Response, next as NextFunction)
    expect(next).toHaveBeenCalled()
  })

  it('calls next() even with no auth header when disabled', () => {
    const middleware = createAuthMiddleware(makeConfig())
    const next = vi.fn()
    middleware(mockReq() as Request, mockRes() as Response, next as NextFunction)
    expect(next).toHaveBeenCalled()
  })

  it('returns 401 when apiKeyRequired true and no auth header', () => {
    const middleware = createAuthMiddleware(makeConfig({ apiKeyRequired: true, apiKeys: [] }))
    const next = vi.fn()
    const res = mockRes()
    middleware(mockReq() as Request, res as Response, next as NextFunction)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 for missing Bearer prefix', () => {
    const hash = createHash('sha256').update('mykey').digest('hex')
    const middleware = createAuthMiddleware(makeConfig({ apiKeyRequired: true, apiKeys: [hash] }))
    const next = vi.fn()
    const res = mockRes()
    middleware(mockReq('Basic mykey') as Request, res as Response, next as NextFunction)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 for invalid token', () => {
    const hash = createHash('sha256').update('validkey').digest('hex')
    const middleware = createAuthMiddleware(makeConfig({ apiKeyRequired: true, apiKeys: [hash] }))
    const next = vi.fn()
    const res = mockRes()
    middleware(mockReq('Bearer wrongtoken') as Request, res as Response, next as NextFunction)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(401)
  })

  it('calls next for valid token', () => {
    const rawKey = 'myvalidapikey'
    const hash = createHash('sha256').update(rawKey).digest('hex')
    const middleware = createAuthMiddleware(makeConfig({ apiKeyRequired: true, apiKeys: [hash] }))
    const next = vi.fn()
    const res = mockRes()
    middleware(mockReq(`Bearer ${rawKey}`) as Request, res as Response, next as NextFunction)
    expect(next).toHaveBeenCalled()
  })

  it('rejects when token not in key list', () => {
    const hash1 = createHash('sha256').update('key1').digest('hex')
    const hash2 = createHash('sha256').update('key2').digest('hex')
    const middleware = createAuthMiddleware(makeConfig({ apiKeyRequired: true, apiKeys: [hash1, hash2] }))
    const next = vi.fn()
    const res = mockRes()
    middleware(mockReq('Bearer key3') as Request, res as Response, next as NextFunction)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(401)
  })

  it('accepts when token matches one of multiple keys', () => {
    const hash1 = createHash('sha256').update('key1').digest('hex')
    const hash2 = createHash('sha256').update('key2').digest('hex')
    const middleware = createAuthMiddleware(makeConfig({ apiKeyRequired: true, apiKeys: [hash1, hash2] }))
    const next = vi.fn()
    const res = mockRes()
    middleware(mockReq('Bearer key2') as Request, res as Response, next as NextFunction)
    expect(next).toHaveBeenCalled()
  })
})
