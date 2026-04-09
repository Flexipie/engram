import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export interface SemanticConfig {
  enabled: boolean
  ollamaUrl: string
  embeddingModel: string
  contradictionThreshold: number
}

export interface ObserverConfig {
  enabled: boolean
  model: 'ollama' | 'haiku'
  ollamaUrl: string
  ollamaModel: string
  haikuApiKey?: string
  batchSize: number
  flushIntervalMs: number
  port: number
}

export interface EngramConfig {
  port: number
  maxMemories: number
  globalMemoryCap: number
  warnThreshold: number
  blockThreshold: number
  alwaysIncludeGlobal: boolean
  minRecallConfidence: number
  domain: string
  apiKeyRequired: boolean
  apiKeys: string[]
  observer: ObserverConfig
  semanticRetrieval: SemanticConfig
}

const OBSERVER_DEFAULTS: ObserverConfig = {
  enabled: false,
  model: 'ollama',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'llama3.2',
  batchSize: 10,
  flushIntervalMs: 30000,
  port: 7338,
}

const SEMANTIC_DEFAULTS: SemanticConfig = {
  enabled: false,
  ollamaUrl: 'http://localhost:11434',
  embeddingModel: 'nomic-embed-text',
  contradictionThreshold: 0.85,
}

const DEFAULTS: EngramConfig = {
  port: 7337,
  maxMemories: 15,
  globalMemoryCap: 5,
  warnThreshold: 0.6,
  blockThreshold: 0.8,
  alwaysIncludeGlobal: false,
  minRecallConfidence: 0.4,
  domain: 'software',
  apiKeyRequired: false,
  apiKeys: [],
  observer: OBSERVER_DEFAULTS,
  semanticRetrieval: SEMANTIC_DEFAULTS,
}

function deepMerge<T extends Record<string, unknown>>(
  defaults: T,
  ...overrides: Partial<T>[]
): T {
  let result = { ...defaults }
  for (const override of overrides) {
    for (const key in override) {
      const val = override[key]
      if (val !== undefined && val !== null && typeof val === 'object' && !Array.isArray(val)) {
        result[key] = {
          ...(result[key] as Record<string, unknown>),
          ...(val as Record<string, unknown>),
        } as T[typeof key]
      } else if (val !== undefined) {
        result[key] = val as T[typeof key]
      }
    }
  }
  return result
}

function readJsonFile(filePath: string): Partial<EngramConfig> {
  if (!existsSync(filePath)) return {}
  try {
    const content = readFileSync(filePath, 'utf-8')
    return JSON.parse(content) as Partial<EngramConfig>
  } catch {
    return {}
  }
}

export function loadConfig(projectDir?: string): EngramConfig {
  const globalConfigPath = join(homedir(), '.engram', 'config.json')
  const globalConfig = readJsonFile(globalConfigPath)

  let projectConfig: Partial<EngramConfig> = {}
  if (projectDir) {
    const projectConfigPath = join(projectDir, '.engram', 'config.json')
    projectConfig = readJsonFile(projectConfigPath)
  }

  return deepMerge(DEFAULTS, globalConfig, projectConfig)
}
