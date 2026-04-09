import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb, createTestGlobalDb, teardownDb } from '../setup.js'
import { handleRemember, handleRecall, handleInvalidate } from '../../mcp/handlers/memory.js'

describe('memory handlers', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    teardownDb(db)
  })

  it('handleRemember with source:manual sets confidence to 0.8', async () => {
    const { id } = await handleRemember(db, null, {
      content: 'manual rule',
      type: 'convention',
      scope: 'api',
      source: 'manual',
    })
    const m = db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as { confidence: number }
    expect(m.confidence).toBe(0.8)
  })

  it('handleRemember with source:agent sets confidence to 0.5', async () => {
    const { id } = await handleRemember(db, null, {
      content: 'agent rule',
      type: 'convention',
      scope: 'api',
      source: 'agent',
    })
    const m = db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as { confidence: number }
    expect(m.confidence).toBe(0.5)
  })

  it('handleRemember defaults to agent confidence when source omitted', async () => {
    const { id } = await handleRemember(db, null, {
      content: 'default source',
      type: 'convention',
      scope: 'api',
    })
    const m = db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as { confidence: number }
    expect(m.confidence).toBe(0.5)
  })

  it('handleRecall with scopes filter returns ContextPacket shape', async () => {
    await handleRemember(db, null, {
      content: 'api convention',
      type: 'convention',
      scope: 'api',
      source: 'manual',
    })
    const packet = await handleRecall(db, null, { scopes: ['api'] })
    expect(packet).toHaveProperty('critical')
    expect(packet).toHaveProperty('relevant')
    expect(packet).toHaveProperty('antipatterns')
    expect(packet).toHaveProperty('global')
    expect(packet).toHaveProperty('total_count')
    expect(packet).toHaveProperty('scopes_available')
  })

  it('handleRecall with query finds relevant memories', async () => {
    await handleRemember(db, null, {
      content: 'always validate with zod',
      type: 'convention',
      scope: 'api',
      source: 'manual',
    })
    const packet = await handleRecall(db, null, { query: 'zod' })
    const all = [...packet.critical, ...packet.relevant, ...packet.antipatterns]
    expect(all.some((m) => m.content.includes('zod'))).toBe(true)
  })

  it('handleInvalidate returns ok:true and excludes memory from recall', async () => {
    const { id } = await handleRemember(db, null, {
      content: 'to be invalidated',
      type: 'convention',
      scope: 'api',
      source: 'manual',
    })
    const result = await handleInvalidate(db, { id })
    expect(result).toEqual({ ok: true })

    const packet = await handleRecall(db, null, { scopes: ['api'] })
    const all = [...packet.critical, ...packet.relevant, ...packet.antipatterns]
    expect(all.find((m) => m.id === id)).toBeUndefined()
  })

  it('handleInvalidate returns ok:false for nonexistent id', async () => {
    const result = await handleInvalidate(db, { id: 'nonexistent-id' })
    expect(result).toEqual({ ok: false })
  })

  it('handleRemember throws Zod error for invalid type', async () => {
    await expect(
      handleRemember(db, null, {
        content: 'test',
        type: 'invalid_type',
        scope: 'api',
      }),
    ).rejects.toThrow()
  })

  it('handleRemember throws Zod error for invalid scope', async () => {
    await expect(
      handleRemember(db, null, {
        content: 'test',
        type: 'convention',
        scope: 'invalid_scope',
      }),
    ).rejects.toThrow()
  })

  // Regression: Bug 2 — process.cwd() used instead of worktree param
  it('handleRemember with source:observer sets confidence to 0.4', async () => {
    const { id } = await handleRemember(db, null, {
      content: 'observer extracted rule',
      type: 'convention',
      scope: 'api',
      source: 'observer',
    })
    const m = db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as { confidence: number }
    expect(m.confidence).toBe(0.4)
  })

  it('handleRemember with global:true uses worktree param for project_origin', async () => {
    const globalDb = createTestGlobalDb()
    try {
      const { id } = await handleRemember(db, globalDb, {
        content: 'global rule',
        type: 'convention',
        scope: 'general',
        global: true,
        worktree: '/my/explicit/project',
      })
      const row = globalDb.prepare('SELECT * FROM global_memories WHERE id = ?').get(id) as {
        project_origin: string
        project_hint: string
      }
      expect(row.project_origin).toBe('/my/explicit/project')
      expect(row.project_hint).toBe('project')
    } finally {
      globalDb.close()
    }
  })

  it('handleRecall with worktree param completes without using server cwd', async () => {
    // Pass an explicit worktree that is NOT a git repo — detectScopes should return [] quickly
    // and not run git in the server's real cwd (which is large and slow)
    const packet = await handleRecall(db, null, {
      worktree: '/tmp/not-a-git-repo-xyz',
    })
    expect(packet).toHaveProperty('critical')
    expect(packet).toHaveProperty('relevant')
    expect(packet).toHaveProperty('total_count')
  })
})
