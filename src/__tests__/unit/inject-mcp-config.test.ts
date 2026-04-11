import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { injectMcpConfig } from '../../cli/utils/inject-mcp-config.js'

function makeTestDir(): string {
  const dir = join(
    tmpdir(),
    `engram-mcp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('injectMcpConfig', () => {
  let testDir: string

  beforeEach(() => {
    testDir = makeTestDir()
  })

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true })
  })

  it('creates settings file with mcpServers.engram when file does not exist', () => {
    const settingsPath = join(testDir, 'settings.json')
    const result = injectMcpConfig(settingsPath, 7337)
    expect(result).toBe('created')
    expect(existsSync(settingsPath)).toBe(true)
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    expect(settings.mcpServers?.engram).toEqual({
      type: 'http',
      url: 'http://localhost:7337/mcp',
    })
  })

  it('returns updated when file exists without engram entry', () => {
    const settingsPath = join(testDir, 'settings.json')
    writeFileSync(settingsPath, JSON.stringify({ someOtherKey: true }), 'utf-8')
    const result = injectMcpConfig(settingsPath, 7337)
    expect(result).toBe('updated')
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    expect(settings.mcpServers?.engram?.url).toBe('http://localhost:7337/mcp')
  })

  it('returns unchanged when entry already has same URL', () => {
    const settingsPath = join(testDir, 'settings.json')
    writeFileSync(
      settingsPath,
      JSON.stringify({ mcpServers: { engram: { type: 'http', url: 'http://localhost:7337/mcp' } } }),
      'utf-8',
    )
    const result = injectMcpConfig(settingsPath, 7337)
    expect(result).toBe('unchanged')
  })

  it('updates URL if port changed, returns updated', () => {
    const settingsPath = join(testDir, 'settings.json')
    writeFileSync(
      settingsPath,
      JSON.stringify({ mcpServers: { engram: { type: 'http', url: 'http://localhost:7337/mcp' } } }),
      'utf-8',
    )
    const result = injectMcpConfig(settingsPath, 8080)
    expect(result).toBe('updated')
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    expect(settings.mcpServers.engram.url).toBe('http://localhost:8080/mcp')
  })

  it('preserves other keys in settings file', () => {
    const settingsPath = join(testDir, 'settings.json')
    writeFileSync(
      settingsPath,
      JSON.stringify({ hooks: { PreToolUse: [] }, permissions: { allow: ['Bash'] } }),
      'utf-8',
    )
    injectMcpConfig(settingsPath, 7337)
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    expect(settings.hooks).toBeDefined()
    expect(settings.permissions).toBeDefined()
    expect(settings.mcpServers?.engram).toBeDefined()
  })

  it('preserves other mcpServers entries', () => {
    const settingsPath = join(testDir, 'settings.json')
    writeFileSync(
      settingsPath,
      JSON.stringify({ mcpServers: { otherServer: { type: 'http', url: 'http://other/mcp' } } }),
      'utf-8',
    )
    injectMcpConfig(settingsPath, 7337)
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    expect(settings.mcpServers.otherServer).toBeDefined()
    expect(settings.mcpServers.engram).toBeDefined()
  })

  it('creates parent directory if missing', () => {
    const nestedDir = join(testDir, 'deep', 'nested', '.claude')
    const settingsPath = join(nestedDir, 'settings.json')
    const result = injectMcpConfig(settingsPath, 7337)
    expect(result).toBe('created')
    expect(existsSync(settingsPath)).toBe(true)
  })
})
