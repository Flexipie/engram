import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export interface EngramConfig {
  port: number
  maxMemories: number
  globalMemoryCap: number
  warnThreshold: number
  blockThreshold: number
  alwaysIncludeGlobal: boolean
  minRecallConfidence: number
}

const DEFAULTS: EngramConfig = {
  port: 7337,
  maxMemories: 15,
  globalMemoryCap: 5,
  warnThreshold: 0.6,
  blockThreshold: 0.8,
  alwaysIncludeGlobal: false,
  minRecallConfidence: 0.4,
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

  return {
    ...DEFAULTS,
    ...globalConfig,
    ...projectConfig,
  }
}
