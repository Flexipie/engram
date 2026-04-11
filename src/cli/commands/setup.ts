import { join } from 'path'
import { homedir } from 'os'
import chalk from 'chalk'
import { runInit } from './init.js'
import { runServiceInstall } from './service.js'
import { runStart } from './start.js'
import { runBootstrapCommand } from './bootstrap.js'
import { injectMcpConfig } from '../utils/inject-mcp-config.js'
import { loadConfig } from '../../config.js'

export interface SetupOptions {
  domain?: string
  noService?: boolean
  skipBootstrap?: boolean
}

async function pollHealth(port: number, maxWaitMs = 5000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    try {
      const resp = await fetch(`http://localhost:${port}/health`)
      if (resp.ok) return true
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  return false
}

export async function runSetup(
  projectDir: string = process.cwd(),
  options: SetupOptions = {},
): Promise<void> {
  const domain = options.domain ?? 'software'
  const projectName = projectDir.split('/').at(-1) ?? projectDir

  console.log(chalk.bold(`\n────────────────────────────────────────`))
  console.log(chalk.bold(`  Engram setup — ${projectName}`))
  console.log(chalk.bold(`────────────────────────────────────────`))

  // Step 1: Init (idempotent)
  await runInit(projectDir, domain)

  // Step 2: Ensure server is running
  if (options.noService) {
    await runStart(projectDir)
  } else if (process.platform === 'darwin') {
    try {
      await runServiceInstall()
    } catch {
      console.log(chalk.yellow('  Service install failed, falling back to per-project start'))
      await runStart(projectDir)
    }
  } else {
    console.log(chalk.gray('  Non-macOS: skipping launchd install, starting per-project server'))
    await runStart(projectDir)
  }

  // Step 3: MCP config injection
  const config = loadConfig(projectDir)
  const port = Number(process.env.ENGRAM_PORT ?? config.port)

  const projectSettings = join(projectDir, '.claude', 'settings.json')
  const projectResult = injectMcpConfig(projectSettings, port)
  const projectLabel = projectResult === 'unchanged' ? chalk.gray('unchanged') : chalk.green(projectResult)
  console.log(`  ${chalk.green('✓')} MCP registered in .claude/settings.json (${projectLabel})`)

  const userSettings = join(homedir(), '.claude', 'settings.json')
  const userResult = injectMcpConfig(userSettings, port)
  const userLabel = userResult === 'unchanged' ? chalk.gray('unchanged') : chalk.green(userResult)
  console.log(`  ${chalk.green('✓')} MCP registered in ~/.claude/settings.json (${userLabel})`)

  // Step 4: Bootstrap
  if (!options.skipBootstrap) {
    try {
      await runBootstrapCommand(projectDir)
    } catch {
      console.log(chalk.gray('  Bootstrap skipped (DB not ready or non-software domain)'))
    }
  } else {
    console.log(chalk.gray('  Bootstrap skipped (--skip-bootstrap)'))
  }

  // Step 5: Health check
  const healthy = await pollHealth(port, 3000)
  if (healthy) {
    console.log(`  ${chalk.green('✓')} Health check passed`)
  } else {
    console.log(`  ${chalk.yellow('!')} Health check failed — server may not be running yet`)
  }

  // Summary
  console.log(chalk.bold(`\n  Engram is ready. Start your agent and call session_start().\n`))
  console.log(`  MCP endpoint: ${chalk.cyan(`http://localhost:${port}/mcp`)}`)
  console.log()
}
