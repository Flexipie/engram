import { randomBytes, createHash } from 'crypto'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import chalk from 'chalk'

interface ApiKeyConfig {
  apiKeyRequired: boolean
  apiKeys: string[]
}

function getGlobalConfigPath(): string {
  return join(homedir(), '.engram', 'config.json')
}

function readApiKeyConfig(): ApiKeyConfig {
  const path = getGlobalConfigPath()
  if (!existsSync(path)) return { apiKeyRequired: false, apiKeys: [] }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as Partial<ApiKeyConfig>
    return {
      apiKeyRequired: raw.apiKeyRequired ?? false,
      apiKeys: raw.apiKeys ?? [],
    }
  } catch {
    return { apiKeyRequired: false, apiKeys: [] }
  }
}

function writeApiKeyConfig(cfg: ApiKeyConfig): void {
  const path = getGlobalConfigPath()
  let existing: Record<string, unknown> = {}
  if (existsSync(path)) {
    try {
      existing = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>
    } catch { /* ignore */ }
  }
  existing['apiKeyRequired'] = cfg.apiKeyRequired
  existing['apiKeys'] = cfg.apiKeys
  writeFileSync(path, JSON.stringify(existing, null, 2), 'utf-8')
}

export function runApiKeyGenerate(): void {
  const rawKey = randomBytes(32).toString('hex')
  const hash = createHash('sha256').update(rawKey).digest('hex')

  const cfg = readApiKeyConfig()
  cfg.apiKeys.push(hash)
  cfg.apiKeyRequired = true
  writeApiKeyConfig(cfg)

  console.log(chalk.bold('\nAPI key generated (shown once — save it now):\n'))
  console.log(chalk.cyan(`  ${rawKey}`))
  console.log(chalk.gray(`\n  Hash stored: ${hash.slice(0, 16)}...`))
  console.log(chalk.gray('  API key auth is now required (apiKeyRequired: true)'))
}

export function runApiKeyList(): void {
  const cfg = readApiKeyConfig()
  if (cfg.apiKeys.length === 0) {
    console.log(chalk.gray('No API keys configured.'))
    return
  }
  console.log(chalk.bold(`\nAPI keys (${cfg.apiKeys.length}):\n`))
  for (const hash of cfg.apiKeys) {
    console.log(`  ${hash}`)
  }
  console.log(chalk.gray(`\napiKeyRequired: ${cfg.apiKeyRequired}`))
}

export function runApiKeyRevoke(hash: string): void {
  const cfg = readApiKeyConfig()
  const before = cfg.apiKeys.length
  cfg.apiKeys = cfg.apiKeys.filter(h => h !== hash)

  if (cfg.apiKeys.length === before) {
    console.error(chalk.red(`Key hash not found: ${hash}`))
    process.exit(1)
  }

  writeApiKeyConfig(cfg)
  console.log(chalk.green(`Revoked key: ${hash}`))

  if (cfg.apiKeys.length === 0) {
    console.log(chalk.yellow('No keys remain. Consider setting apiKeyRequired: false.'))
  }
}
