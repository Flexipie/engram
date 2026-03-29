import { mkdirSync, existsSync, writeFileSync, readFileSync, copyFileSync, chmodSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import chalk from 'chalk'

const __dirname = dirname(fileURLToPath(import.meta.url))

const HOOKS_SOURCE_DIR = join(__dirname, '../../../hooks')

const DEFAULT_CONFIG = {
  port: 7337,
  maxMemories: 15,
  globalMemoryCap: 5,
  warnThreshold: 0.6,
  blockThreshold: 0.8,
}

const SENTINEL_START = '<!-- engram:start -->'
const SENTINEL_END = '<!-- engram:end -->'

function getSnippet(): string {
  const templatePath = join(__dirname, '../../../templates/claude-snippet.md')
  if (existsSync(templatePath)) {
    return readFileSync(templatePath, 'utf-8')
  }
  return `${SENTINEL_START}
## Engram — Project Intelligence

You have access to an Engram MCP server at http://localhost:7337/mcp that provides persistent project memory across sessions and compactions.

**At the start of every session:**
1. Call \`session_start()\` — resumes your previous task state if it exists, loads relevant memories
2. Review the returned \`task\` object — this is your previous state, continue from here

**During the session:**
- After completing a discrete piece of work, call \`update_task()\` with your progress
- When you learn something about this codebase that should persist, call \`remember()\`
- When you encounter a build error or test failure, call \`check_error()\` BEFORE diagnosing
- After resolving an error, call \`record_error()\` with the cause and fix
- When about to modify a file another worktree may be touching, call \`get_worktree_status()\` first

**The goal:** Every session makes the next session smarter. Treat Engram as your project notebook.
${SENTINEL_END}
`
}

function injectClaudeMd(projectDir: string): void {
  const claudeMdPath = join(projectDir, 'CLAUDE.md')
  const snippet = getSnippet()

  if (!existsSync(claudeMdPath)) {
    writeFileSync(claudeMdPath, snippet, 'utf-8')
    console.log(chalk.green('  Created CLAUDE.md with Engram snippet'))
    return
  }

  const content = readFileSync(claudeMdPath, 'utf-8')

  if (content.includes(SENTINEL_START)) {
    // Already has sentinel — replace content between sentinels
    const startIdx = content.indexOf(SENTINEL_START)
    const endIdx = content.indexOf(SENTINEL_END)
    if (startIdx !== -1 && endIdx !== -1) {
      const before = content.slice(0, startIdx)
      const after = content.slice(endIdx + SENTINEL_END.length)
      writeFileSync(claudeMdPath, before + snippet + after, 'utf-8')
      console.log(chalk.green('  Updated Engram snippet in CLAUDE.md (idempotent)'))
    }
    return
  }

  // Append snippet
  writeFileSync(claudeMdPath, content + '\n\n' + snippet, 'utf-8')
  console.log(chalk.green('  Injected Engram snippet into CLAUDE.md'))
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

  // PostToolUse — heartbeat.sh
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

  settings['hooks'] = hooks
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
  console.log(chalk.green('  Updated .claude/settings.json with Engram hooks'))
}

export async function runInit(projectDir: string = process.cwd()): Promise<void> {
  console.log(chalk.bold('\nEngram init\n'))

  // 1. Create .engram/
  const engramDir = join(projectDir, '.engram')
  mkdirSync(engramDir, { recursive: true })
  console.log(chalk.green('  Created .engram/'))

  // 2. Create .engram/config.json
  const configPath = join(engramDir, 'config.json')
  if (!existsSync(configPath)) {
    writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8')
    console.log(chalk.green('  Created .engram/config.json'))
  } else {
    console.log(chalk.gray('  .engram/config.json already exists'))
  }

  // 3. Create .engram/hooks/ and copy hook scripts
  const hooksDestDir = join(engramDir, 'hooks')
  mkdirSync(hooksDestDir, { recursive: true })

  const hookFiles = ['enforce.sh', 'snapshot.sh', 'heartbeat.sh']
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
