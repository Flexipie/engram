import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EngramClient } from '../client.js'
import { EngramApiError, EngramError } from '../errors.js'

// ── helpers ─────────────────────────────────────────────────────────────────

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  })
}

function mockFetchError(message: string) {
  return vi.fn().mockRejectedValue(new TypeError(message))
}

const BASE = 'http://localhost:7337'

// ── shared fixtures ──────────────────────────────────────────────────────────

const MEMORY = {
  id: 'mem-1',
  type: 'convention',
  scope: 'api',
  content: 'Use zod for validation',
  confidence: 0.8,
  source: 'agent',
  evidence_count: 1,
  invalidated: 0,
  invalidation_reason: null,
  last_validated: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const CONTEXT_PACKET = {
  critical: [MEMORY],
  relevant: [],
  antipatterns: [],
  global: [],
  total_count: 1,
  scopes_available: ['api', 'general'],
}

const TASK = {
  id: 'task-1',
  worktree: '/repo',
  title: 'Build SDK',
  goal: 'Ship phase 10',
  status: 'active',
  session_id: 'sess-1',
  started_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  archived_at: null,
}

const SESSION_RESULT = {
  task: TASK,
  memories: CONTEXT_PACKET,
  worktree_conflicts: [],
  file_conflicts: [],
  session_id: 'sess-1',
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('EngramClient', () => {
  let client: EngramClient
  const worktree = '/my/project'

  beforeEach(() => {
    client = new EngramClient({ baseUrl: BASE, worktree })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── constructor defaults ──────────────────────────────────────────────────

  describe('constructor', () => {
    it('defaults baseUrl to http://localhost:7337', () => {
      const c = new EngramClient()
      expect((c as any).transport.baseUrl).toBe('http://localhost:7337')
    })

    it('defaults worktree to process.cwd()', () => {
      const c = new EngramClient()
      expect((c as any).transport.defaultWorktree).toBe(process.cwd())
    })

    it('accepts custom baseUrl and worktree', () => {
      const c = new EngramClient({ baseUrl: 'http://localhost:9999', worktree: '/custom' })
      expect((c as any).transport.baseUrl).toBe('http://localhost:9999')
      expect((c as any).transport.defaultWorktree).toBe('/custom')
    })

    it('sets apiKey on transport', () => {
      const c = new EngramClient({ apiKey: 'secret' })
      expect((c as any).transport.apiKey).toBe('secret')
    })
  })

  // ── sessionStart ──────────────────────────────────────────────────────────

  describe('sessionStart', () => {
    it('POSTs to /v1/sessions', async () => {
      globalThis.fetch = mockFetch(SESSION_RESULT)
      const result = await client.sessionStart()
      const [url, init] = (globalThis.fetch as any).mock.calls[0]
      expect(url).toBe(`${BASE}/v1/sessions`)
      expect(init.method).toBe('POST')
      expect(result.session_id).toBe('sess-1')
    })

    it('sends worktree from constructor default', async () => {
      globalThis.fetch = mockFetch(SESSION_RESULT)
      await client.sessionStart()
      const [, init] = (globalThis.fetch as any).mock.calls[0]
      expect(JSON.parse(init.body).worktree).toBe(worktree)
    })

    it('overrides worktree per-call', async () => {
      globalThis.fetch = mockFetch(SESSION_RESULT)
      await client.sessionStart({ worktree: '/other' })
      const [, init] = (globalThis.fetch as any).mock.calls[0]
      expect(JSON.parse(init.body).worktree).toBe('/other')
    })

    it('sends context_hint when provided', async () => {
      globalThis.fetch = mockFetch(SESSION_RESULT)
      await client.sessionStart({ contextHint: 'working on auth' })
      const [, init] = (globalThis.fetch as any).mock.calls[0]
      expect(JSON.parse(init.body).context_hint).toBe('working on auth')
    })

    it('handles task: null (no prior session)', async () => {
      globalThis.fetch = mockFetch({ ...SESSION_RESULT, task: null })
      const result = await client.sessionStart()
      expect(result.task).toBeNull()
    })
  })

  // ── getCurrentSession ─────────────────────────────────────────────────────

  describe('getCurrentSession', () => {
    it('GETs /v1/sessions/current with worktree query param', async () => {
      globalThis.fetch = mockFetch({ task: TASK, state: null })
      await client.getCurrentSession()
      const [url] = (globalThis.fetch as any).mock.calls[0]
      expect(url).toContain('/v1/sessions/current')
      expect(url).toContain(`worktree=`)
    })

    it('returns null on 404', async () => {
      globalThis.fetch = mockFetch({ error: 'No active task' }, 404)
      const result = await client.getCurrentSession()
      expect(result).toBeNull()
    })

    it('allows worktree override', async () => {
      globalThis.fetch = mockFetch({ task: TASK, state: null })
      await client.getCurrentSession('/override')
      const [url] = (globalThis.fetch as any).mock.calls[0]
      expect(url).toContain(encodeURIComponent('/override'))
    })
  })

  // ── updateTask ────────────────────────────────────────────────────────────

  describe('updateTask', () => {
    it('PATCHes /v1/sessions/current', async () => {
      globalThis.fetch = mockFetch({ task_id: 'task-1' })
      const result = await client.updateTask({ title: 'new title' })
      const [url, init] = (globalThis.fetch as any).mock.calls[0]
      expect(url).toBe(`${BASE}/v1/sessions/current`)
      expect(init.method).toBe('PATCH')
      expect(result.task_id).toBe('task-1')
    })

    it('sends worktree in body', async () => {
      globalThis.fetch = mockFetch({ task_id: 'task-1' })
      await client.updateTask({ title: 'x' })
      const [, init] = (globalThis.fetch as any).mock.calls[0]
      expect(JSON.parse(init.body).worktree).toBe(worktree)
    })
  })

  // ── createSnapshot ────────────────────────────────────────────────────────

  describe('createSnapshot', () => {
    it('POSTs to /v1/sessions/:id/snapshot', async () => {
      globalThis.fetch = mockFetch({ snapshot_id: 'snap-1' }, 201)
      const result = await client.createSnapshot('task-1')
      const [url, init] = (globalThis.fetch as any).mock.calls[0]
      expect(url).toBe(`${BASE}/v1/sessions/task-1/snapshot`)
      expect(init.method).toBe('POST')
      expect(result.snapshot_id).toBe('snap-1')
    })

    it('sends trigger when provided', async () => {
      globalThis.fetch = mockFetch({ snapshot_id: 'snap-1' }, 201)
      await client.createSnapshot('task-1', 'compaction')
      const [, init] = (globalThis.fetch as any).mock.calls[0]
      expect(JSON.parse(init.body).trigger).toBe('compaction')
    })

    it('sends worktree in body', async () => {
      globalThis.fetch = mockFetch({ snapshot_id: 'snap-1' }, 201)
      await client.createSnapshot('task-1')
      const [, init] = (globalThis.fetch as any).mock.calls[0]
      expect(JSON.parse(init.body).worktree).toBe(worktree)
    })

    it('allows worktree override', async () => {
      globalThis.fetch = mockFetch({ snapshot_id: 'snap-1' }, 201)
      await client.createSnapshot('task-1', undefined, '/other')
      const [, init] = (globalThis.fetch as any).mock.calls[0]
      expect(JSON.parse(init.body).worktree).toBe('/other')
    })
  })

  // ── remember ──────────────────────────────────────────────────────────────

  describe('remember', () => {
    it('POSTs to /v1/memories', async () => {
      globalThis.fetch = mockFetch({ id: 'mem-1' }, 201)
      const result = await client.remember({ content: 'use zod', type: 'convention', scope: 'api' })
      const [url, init] = (globalThis.fetch as any).mock.calls[0]
      expect(url).toBe(`${BASE}/v1/memories`)
      expect(init.method).toBe('POST')
      expect(result.id).toBe('mem-1')
    })

    it('sends content, type, scope, source in body', async () => {
      globalThis.fetch = mockFetch({ id: 'mem-1' }, 201)
      await client.remember({ content: 'use zod', type: 'convention', scope: 'api', source: 'manual' })
      const [, init] = (globalThis.fetch as any).mock.calls[0]
      const body = JSON.parse(init.body)
      expect(body.content).toBe('use zod')
      expect(body.type).toBe('convention')
      expect(body.scope).toBe('api')
      expect(body.source).toBe('manual')
    })

    it('defaults source to agent', async () => {
      globalThis.fetch = mockFetch({ id: 'mem-1' }, 201)
      await client.remember({ content: 'x', type: 'convention', scope: 'api' })
      const [, init] = (globalThis.fetch as any).mock.calls[0]
      expect(JSON.parse(init.body).source).toBe('agent')
    })

    it('sends worktree in body', async () => {
      globalThis.fetch = mockFetch({ id: 'mem-1' }, 201)
      await client.remember({ content: 'x', type: 'convention', scope: 'api' })
      const [, init] = (globalThis.fetch as any).mock.calls[0]
      expect(JSON.parse(init.body).worktree).toBe(worktree)
    })

    it('returns contradicts_with when server returns it', async () => {
      globalThis.fetch = mockFetch({ id: 'mem-1', contradicts_with: [{ id: 'mem-0', content: 'old', similarity: 0.9 }] }, 201)
      const result = await client.remember({ content: 'x', type: 'convention', scope: 'api' })
      expect(result.contradicts_with).toHaveLength(1)
      expect(result.contradicts_with![0].similarity).toBe(0.9)
    })
  })

  // ── recall ────────────────────────────────────────────────────────────────

  describe('recall', () => {
    it('POSTs to /v1/recall', async () => {
      globalThis.fetch = mockFetch(CONTEXT_PACKET)
      const result = await client.recall()
      const [url, init] = (globalThis.fetch as any).mock.calls[0]
      expect(url).toBe(`${BASE}/v1/recall`)
      expect(init.method).toBe('POST')
      expect(result.critical).toHaveLength(1)
    })

    it('sends all three buckets correctly', async () => {
      globalThis.fetch = mockFetch({
        ...CONTEXT_PACKET,
        relevant: [MEMORY],
        antipatterns: [{ ...MEMORY, type: 'anti_pattern' }],
      })
      const result = await client.recall({ query: 'zod' })
      expect(result.critical).toHaveLength(1)
      expect(result.relevant).toHaveLength(1)
      expect(result.antipatterns).toHaveLength(1)
    })

    it('sends scopes, types, query, include_global, limit', async () => {
      globalThis.fetch = mockFetch(CONTEXT_PACKET)
      await client.recall({ scopes: ['api'], types: ['convention'], query: 'zod', include_global: true, limit: 5 })
      const [, init] = (globalThis.fetch as any).mock.calls[0]
      const body = JSON.parse(init.body)
      expect(body.scopes).toEqual(['api'])
      expect(body.types).toEqual(['convention'])
      expect(body.query).toBe('zod')
      expect(body.include_global).toBe(true)
      expect(body.limit).toBe(5)
    })

    it('sends worktree in body', async () => {
      globalThis.fetch = mockFetch(CONTEXT_PACKET)
      await client.recall()
      const [, init] = (globalThis.fetch as any).mock.calls[0]
      expect(JSON.parse(init.body).worktree).toBe(worktree)
    })
  })

  // ── getMemories ───────────────────────────────────────────────────────────

  describe('getMemories', () => {
    it('GETs /v1/memories with query params', async () => {
      globalThis.fetch = mockFetch({ memories: [MEMORY], total: 1 })
      const result = await client.getMemories({ scope: 'api', type: 'convention', limit: 10 })
      const [url] = (globalThis.fetch as any).mock.calls[0]
      expect(url).toContain('/v1/memories')
      expect(url).toContain('scope=api')
      expect(url).toContain('type=convention')
      expect(url).toContain('limit=10')
      expect(result.total).toBe(1)
    })

    it('sends worktree as query param', async () => {
      globalThis.fetch = mockFetch({ memories: [], total: 0 })
      await client.getMemories()
      const [url] = (globalThis.fetch as any).mock.calls[0]
      expect(url).toContain('worktree=')
    })
  })

  // ── getMemory ─────────────────────────────────────────────────────────────

  describe('getMemory', () => {
    it('GETs /v1/memories/:id', async () => {
      globalThis.fetch = mockFetch(MEMORY)
      const result = await client.getMemory('mem-1')
      const [url] = (globalThis.fetch as any).mock.calls[0]
      expect(url).toContain('/v1/memories/mem-1')
      expect(result?.id).toBe('mem-1')
    })

    it('returns null on 404', async () => {
      globalThis.fetch = mockFetch({ error: 'Not found' }, 404)
      const result = await client.getMemory('missing')
      expect(result).toBeNull()
    })
  })

  // ── updateMemory ──────────────────────────────────────────────────────────

  describe('updateMemory', () => {
    it('PATCHes /v1/memories/:id', async () => {
      globalThis.fetch = mockFetch({ ok: true })
      const result = await client.updateMemory('mem-1', { confidence: 0.9 })
      const [url, init] = (globalThis.fetch as any).mock.calls[0]
      expect(url).toContain('/v1/memories/mem-1')
      expect(init.method).toBe('PATCH')
      expect(result.ok).toBe(true)
    })
  })

  // ── invalidate ────────────────────────────────────────────────────────────

  describe('invalidate', () => {
    it('DELETEs /v1/memories/:id', async () => {
      globalThis.fetch = mockFetch({ ok: true })
      const result = await client.invalidate('mem-1', 'outdated')
      const [url, init] = (globalThis.fetch as any).mock.calls[0]
      expect(url).toContain('/v1/memories/mem-1')
      expect(init.method).toBe('DELETE')
      expect(JSON.parse(init.body).reason).toBe('outdated')
      expect(result.ok).toBe(true)
    })
  })

  // ── checkError ────────────────────────────────────────────────────────────

  describe('checkError', () => {
    it('POSTs to /v1/errors/check', async () => {
      globalThis.fetch = mockFetch({ found: true, id: 'err-1', signature: 'abc', cause: 'bad import', fix: 'use esm', recurrence: 2, scope: 'build', last_seen: '2026-01-01' })
      const result = await client.checkError({ errorRaw: 'Cannot find module' })
      const [url, init] = (globalThis.fetch as any).mock.calls[0]
      expect(url).toBe(`${BASE}/v1/errors/check`)
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body).error_raw).toBe('Cannot find module')
      expect(result.found).toBe(true)
    })

    it('handles found: false discriminated union', async () => {
      globalThis.fetch = mockFetch({ found: false, signature: 'xyz' })
      const result = await client.checkError({ errorRaw: 'unknown error' })
      expect(result.found).toBe(false)
      if (!result.found) {
        expect(result.signature).toBe('xyz')
      }
    })

    it('sends scope when provided', async () => {
      globalThis.fetch = mockFetch({ found: false, signature: 'x' })
      await client.checkError({ errorRaw: 'err', scope: 'testing' })
      const [, init] = (globalThis.fetch as any).mock.calls[0]
      expect(JSON.parse(init.body).scope).toBe('testing')
    })
  })

  // ── recordError ───────────────────────────────────────────────────────────

  describe('recordError', () => {
    it('POSTs to /v1/errors/record', async () => {
      globalThis.fetch = mockFetch({ id: 'err-1', signature: 'abc', recurrence: 1, updated: false }, 201)
      const result = await client.recordError({ errorRaw: 'Cannot find module', cause: 'missing import', fix: 'add esm ext' })
      const [url, init] = (globalThis.fetch as any).mock.calls[0]
      expect(url).toBe(`${BASE}/v1/errors/record`)
      expect(init.method).toBe('POST')
      const body = JSON.parse(init.body)
      expect(body.error_raw).toBe('Cannot find module')
      expect(body.cause).toBe('missing import')
      expect(body.fix).toBe('add esm ext')
      expect(result.id).toBe('err-1')
    })
  })

  // ── getErrors ─────────────────────────────────────────────────────────────

  describe('getErrors', () => {
    it('GETs /v1/errors', async () => {
      globalThis.fetch = mockFetch({ errors: [] })
      await client.getErrors()
      const [url] = (globalThis.fetch as any).mock.calls[0]
      expect(url).toContain('/v1/errors')
    })

    it('sends scope and limit as query params', async () => {
      globalThis.fetch = mockFetch({ errors: [] })
      await client.getErrors({ scope: 'build', limit: 5 })
      const [url] = (globalThis.fetch as any).mock.calls[0]
      expect(url).toContain('scope=build')
      expect(url).toContain('limit=5')
    })
  })

  // ── enforce ───────────────────────────────────────────────────────────────

  describe('enforce', () => {
    it('POSTs to /v1/enforce', async () => {
      globalThis.fetch = mockFetch({ scope: 'api', violations: [], warnings: ['use zod'], memories_checked: 3 })
      const result = await client.enforce({ filePath: 'src/routes/auth.ts' })
      const [url, init] = (globalThis.fetch as any).mock.calls[0]
      expect(url).toBe(`${BASE}/v1/enforce`)
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body).file_path).toBe('src/routes/auth.ts')
      expect(result.warnings).toHaveLength(1)
    })

    it('sends scope when provided', async () => {
      globalThis.fetch = mockFetch({ scope: 'api', violations: [], warnings: [], memories_checked: 0 })
      await client.enforce({ filePath: 'x.ts', scope: 'api' })
      const [, init] = (globalThis.fetch as any).mock.calls[0]
      expect(JSON.parse(init.body).scope).toBe('api')
    })

    it('sends worktree in body', async () => {
      globalThis.fetch = mockFetch({ scope: 'api', violations: [], warnings: [], memories_checked: 0 })
      await client.enforce({ filePath: 'x.ts' })
      const [, init] = (globalThis.fetch as any).mock.calls[0]
      expect(JSON.parse(init.body).worktree).toBe(worktree)
    })
  })

  // ── getStats ──────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('GETs /v1/stats', async () => {
      const stats = {
        tools: { session_start: { calls: 5, task_hits: 3 }, remember: { calls: 10 }, recall: { calls: 2, memories_returned: 20 }, check_error: { calls: 1, hits: 0 }, record_error: { calls: 0 }, invalidate: { calls: 0 }, update_task: { calls: 3 }, get_worktree_status: { calls: 0 }, check_conventions: { calls: 0 } },
        enforcement: { checks: 10, violations: 0, warnings: 2 },
      }
      globalThis.fetch = mockFetch(stats)
      const result = await client.getStats()
      const [url, init] = (globalThis.fetch as any).mock.calls[0]
      expect(url).toBe(`${BASE}/v1/stats`)
      expect(init.method).toBe('GET')
      expect(result.enforcement.warnings).toBe(2)
    })
  })

  // ── auth header ───────────────────────────────────────────────────────────

  describe('auth', () => {
    it('sends Authorization: Bearer header when apiKey set', async () => {
      const c = new EngramClient({ baseUrl: BASE, apiKey: 'my-secret', worktree })
      globalThis.fetch = mockFetch(SESSION_RESULT)
      await c.sessionStart()
      const [, init] = (globalThis.fetch as any).mock.calls[0]
      expect(init.headers['Authorization']).toBe('Bearer my-secret')
    })

    it('does not send Authorization header without apiKey', async () => {
      globalThis.fetch = mockFetch(SESSION_RESULT)
      await client.sessionStart()
      const [, init] = (globalThis.fetch as any).mock.calls[0]
      expect(init.headers['Authorization']).toBeUndefined()
    })
  })

  // ── error handling ────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('throws EngramApiError on 4xx', async () => {
      globalThis.fetch = mockFetch({ error: 'type is required' }, 400)
      await expect(client.remember({ content: 'x', type: 'convention', scope: 'api' })).rejects.toBeInstanceOf(EngramApiError)
    })

    it('throws EngramApiError with correct status', async () => {
      globalThis.fetch = mockFetch({ error: 'Unauthorized' }, 401)
      await expect(client.recall()).rejects.toMatchObject({
        status: 401,
      })
    })

    it('throws EngramApiError on 5xx', async () => {
      globalThis.fetch = mockFetch({ error: 'Internal error' }, 500)
      await expect(client.sessionStart()).rejects.toBeInstanceOf(EngramApiError)
    })

    it('throws EngramError on network failure', async () => {
      globalThis.fetch = mockFetchError('Failed to fetch')
      await expect(client.sessionStart()).rejects.toBeInstanceOf(EngramError)
    })

    it('throws EngramError when server returns non-JSON', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: () => Promise.reject(new SyntaxError('Unexpected token')),
      })
      await expect(client.sessionStart()).rejects.toBeInstanceOf(EngramError)
    })

    it('EngramApiError is an instance of EngramError', async () => {
      globalThis.fetch = mockFetch({ error: 'bad' }, 400)
      await expect(client.recall()).rejects.toBeInstanceOf(EngramError)
    })
  })
})
