import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'

type InjectResult = 'created' | 'updated' | 'unchanged'

export function injectMcpConfig(settingsPath: string, port: number): InjectResult {
  const url = `http://localhost:${port}/mcp`
  const engramEntry = { type: 'http', url }

  // Ensure parent directory exists
  const parentDir = dirname(settingsPath)
  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true })
  }

  const fileExists = existsSync(settingsPath)
  let settings: Record<string, unknown> = {}

  if (fileExists) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>
    } catch {
      settings = {}
    }
  }

  const mcpServers = (settings['mcpServers'] ?? {}) as Record<string, unknown>
  const existing = mcpServers['engram'] as Record<string, unknown> | undefined

  if (existing && existing['url'] === url) {
    return 'unchanged'
  }

  mcpServers['engram'] = engramEntry
  settings['mcpServers'] = mcpServers
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')

  return fileExists ? 'updated' : 'created'
}
