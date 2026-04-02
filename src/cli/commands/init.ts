import { mkdirSync, existsSync, writeFileSync, readFileSync, copyFileSync, chmodSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import chalk from 'chalk'
import { injectClaudeMd as doInjectClaudeMd } from '../utils/inject-claude-md.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const HOOKS_SOURCE_DIR = join(__dirname, '../../hooks')

const DEFAULT_CONFIG = {
  port: 7337,
  maxMemories: 15,
  globalMemoryCap: 5,
  warnThreshold: 0.6,
  blockThreshold: 0.8,
  domain: 'software',
}

function injectClaudeMd(projectDir: string): void {
  const result = doInjectClaudeMd(projectDir)
  if (result === 'created') {
    console.log(chalk.green('  Created CLAUDE.md with Engram snippet'))
  } else if (result === 'updated') {
    console.log(chalk.green('  Updated Engram snippet in CLAUDE.md'))
  } else {
    console.log(chalk.gray('  CLAUDE.md Engram snippet already up to date'))
  }
}

function mergeSettingsJson(projectDir: string): void {
  const claudeDir = join(projectDir, '.claude')
  const settingsPath = join(claudeDir, 'settings.json')

  if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true })

  let settings: Record<string, unknown> = {}
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>
    } catch {
      settings = {}
    }
  }

  const hooks = (settings['hooks'] ?? {}) as Record<string, unknown[]>

  const engramHookPath = (hookFile: string) =>
    `\${CLAUDE_PROJECT_DIR}/.engram/hooks/${hookFile}`

  const hasHook = (hooksList: unknown[], cmdSubstring: string): boolean =>
    hooksList.some(
      (h) =>
        typeof h === 'object' &&
        h !== null &&
        'hooks' in h &&
        Array.isArray((h as Record<string, unknown>)['hooks']) &&
        ((h as Record<string, unknown[]>)['hooks'] as unknown[]).some(
          (inner) =>
            typeof inner === 'object' &&
            inner !== null &&
            'command' in inner &&
            typeof (inner as Record<string, unknown>)['command'] === 'string' &&
            ((inner as Record<string, string>)['command']).includes(cmdSubstring),
        ),
    )

  // PreToolUse — enforce.sh
  const preToolUse = (hooks['PreToolUse'] ?? []) as unknown[]
  if (!hasHook(preToolUse, 'enforce.sh')) {
    preToolUse.push({
      matcher: 'Write',
      hooks: [
        {
          type: 'command',
          command: engramHookPath('enforce.sh'),
        },
      ],
    })
    hooks['PreToolUse'] = preToolUse
  }

  // PreCompact — snapshot.sh
  const preCompact = (hooks['PreCompact'] ?? []) as unknown[]
  if (!hasHook(preCompact, 'snapshot.sh')) {
    preCompact.push({
      hooks: [
        {
          type: 'command',
          command: engramHookPath('snapshot.sh'),
        },
      ],
    })
    hooks['PreCompact'] = preCompact
  }

  // PostToolUse — heartbeat.sh + observer.sh
  const postToolUse = (hooks['PostToolUse'] ?? []) as unknown[]
  if (!hasHook(postToolUse, 'heartbeat.sh')) {
    postToolUse.push({
      hooks: [
        {
          type: 'command',
          command: engramHookPath('heartbeat.sh'),
        },
      ],
    })
    hooks['PostToolUse'] = postToolUse
  }
  if (!hasHook(postToolUse, 'observer.sh')) {
    postToolUse.push({
      hooks: [
        {
          type: 'command',
          command: engramHookPath('observer.sh'),
        },
      ],
    })
    hooks['PostToolUse'] = postToolUse
  }

  settings['hooks'] = hooks
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
  console.log(chalk.green('  Updated .claude/settings.json with Engram hooks'))
}

export async function runInit(projectDir: string = process.cwd(), domain = 'software'): Promise<void> {
  console.log(chalk.bold('\nEngram init\n'))

  // 1. Create .engram/
  const engramDir = join(projectDir, '.engram')
  mkdirSync(engramDir, { recursive: true })
  console.log(chalk.green('  Created .engram/'))

  // 2. Create .engram/config.json
  const configPath = join(engramDir, 'config.json')
  if (!existsSync(configPath)) {
    const config = { ...DEFAULT_CONFIG, domain }
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
    console.log(chalk.green('  Created .engram/config.json'))
  } else {
    // Update domain if config already exists
    try {
      const existing = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>
      existing['domain'] = domain
      writeFileSync(configPath, JSON.stringify(existing, null, 2), 'utf-8')
    } catch { /* ignore */ }
    console.log(chalk.gray('  .engram/config.json already exists (domain updated)'))
  }

  // 3. Create .engram/hooks/ and copy hook scripts
  const hooksDestDir = join(engramDir, 'hooks')
  mkdirSync(hooksDestDir, { recursive: true })

  const hookFiles = ['enforce.sh', 'snapshot.sh', 'heartbeat.sh', 'observer.sh']
  for (const hookFile of hookFiles) {
    const src = join(HOOKS_SOURCE_DIR, hookFile)
    const dest = join(hooksDestDir, hookFile)
    if (existsSync(src)) {
      copyFileSync(src, dest)
      chmodSync(dest, 0o755)
      console.log(chalk.green(`  Copied hooks/${hookFile}`))
    } else {
      console.log(chalk.yellow(`  Warning: source hook ${hookFile} not found at ${src}`))
    }
  }

  // 4. Inject CLAUDE.md snippet
  injectClaudeMd(projectDir)

  // 5. Merge .claude/settings.json
  mergeSettingsJson(projectDir)

  console.log(chalk.bold('\nEngram initialized successfully!\n'))
  console.log(`Run ${chalk.cyan('engram start')} to start the MCP server.`)
}
