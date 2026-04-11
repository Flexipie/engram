import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb, createTestGlobalDb, teardownDb, createTestPool } from '../setup.js'
import { insertMemory } from '../../db/memories.js'
import { insertGlobalMemory } from '../../db/global.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { setupTools } from '../../mcp/tools.js'

function makeServer(db: Database.Database, globalDb?: Database.Database | null) {
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  const pool = createTestPool(db)
  setupTools(server, pool, globalDb ?? null)
  return server
}

async function callTool(server: McpServer, name: string, params: Record<string, unknown>) {
  // Access the registered tool handlers directly via the internal registry
  const tools = (server as unknown as { _registeredTools: Record<string, { handler: (p: unknown) => Promise<unknown> }> })._registeredTools
  const tool = tools[name]
  if (!tool) throw new Error(`Tool ${name} not registered`)
  return tool.handler(params) as Promise<{ content: Array<{ type: string; text: string }> }>
}

describe('browse_memories tool', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    teardownDb(db)
  })

  it('returns all memories when no filters', async () => {
    insertMemory(db, { type: 'convention', scope: 'api', content: 'api mem', confidence: 0.9 })
    insertMemory(db, { type: 'decision', scope: 'testing', content: 'test mem', confidence: 0.7 })
    const server = makeServer(db)
    const res = await callTool(server, 'browse_memories', {})
    const result = JSON.parse(res.content[0].text)
    expect(result.memories.length).toBe(2)
    expect(result.total).toBe(2)
  })

  it('filters by scope correctly', async () => {
    insertMemory(db, { type: 'convention', scope: 'api', content: 'api mem', confidence: 0.9 })
    insertMemory(db, { type: 'convention', scope: 'testing', content: 'test mem', confidence: 0.9 })
    const server = makeServer(db)
    const res = await callTool(server, 'browse_memories', { scope: 'api' })
    const result = JSON.parse(res.content[0].text)
    expect(result.memories.length).toBe(1)
    expect(result.memories[0].scope).toBe('api')
  })

  it('filters by type correctly', async () => {
    insertMemory(db, { type: 'convention', scope: 'api', content: 'convention mem', confidence: 0.9 })
    insertMemory(db, { type: 'decision', scope: 'api', content: 'decision mem', confidence: 0.9 })
    const server = makeServer(db)
    const res = await callTool(server, 'browse_memories', { type: 'decision' })
    const result = JSON.parse(res.content[0].text)
    expect(result.memories.length).toBe(1)
    expect(result.memories[0].type).toBe('decision')
  })

  it('include_global: true includes global memories', async () => {
    const globalDb = createTestGlobalDb()
    insertGlobalMemory(globalDb, {
      type: 'convention',
      scope: 'general',
      content: 'global mem',
      confidence: 0.8,
      project_origin: '/proj',
    })
    const server = makeServer(db, globalDb)
    const res = await callTool(server, 'browse_memories', { include_global: true })
    const result = JSON.parse(res.content[0].text)
    expect(result.global.length).toBe(1)
    globalDb.close()
  })

  it('include_global: false excludes global memories', async () => {
    const globalDb = createTestGlobalDb()
    insertGlobalMemory(globalDb, {
      type: 'convention',
      scope: 'general',
      content: 'global mem',
      confidence: 0.8,
      project_origin: '/proj',
    })
    const server = makeServer(db, globalDb)
    const res = await callTool(server, 'browse_memories', { include_global: false })
    const result = JSON.parse(res.content[0].text)
    expect(result.global.length).toBe(0)
    globalDb.close()
  })

  it('respects limit param', async () => {
    for (let i = 0; i < 10; i++) {
      insertMemory(db, { type: 'convention', scope: 'api', content: `mem ${i}`, confidence: 0.9 })
    }
    const server = makeServer(db)
    const res = await callTool(server, 'browse_memories', { limit: 3 })
    const result = JSON.parse(res.content[0].text)
    expect(result.memories.length).toBe(3)
  })

  it('returns scopes_available listing all existing scopes', async () => {
    insertMemory(db, { type: 'convention', scope: 'api', content: 'api mem', confidence: 0.9 })
    insertMemory(db, { type: 'convention', scope: 'testing', content: 'test mem', confidence: 0.9 })
    const server = makeServer(db)
    // Filter by one scope — scopes_available should still list all
    const res = await callTool(server, 'browse_memories', { scope: 'api' })
    const result = JSON.parse(res.content[0].text)
    expect(result.scopes_available).toContain('api')
    expect(result.scopes_available).toContain('testing')
  })
})
