#!/usr/bin/env node
import { Command } from 'commander'
import { runInit } from './commands/init.js'
import { runStart } from './commands/start.js'
import { runStop } from './commands/stop.js'
import { runStatus } from './commands/status.js'
import { runTask } from './commands/task.js'
import { runMemories } from './commands/memories.js'
import { runInvalidate } from './commands/invalidate.js'
import { runErrors } from './commands/errors.js'
import { runServiceInstall, runServiceUninstall, runServiceStatus } from './commands/service.js'
import { runUpdateClaudeMd } from './commands/update-claude-md.js'
import { runBootstrapCommand } from './commands/bootstrap.js'
import { runGcCommand } from './commands/gc.js'
import { runExportCommand, runImportCommand } from './commands/export.js'
import { runApiKeyGenerate, runApiKeyList, runApiKeyRevoke } from './commands/apikey.js'
import { runObserverStart, runObserverStop, runObserverStatus } from './commands/observer.js'
import { runSetup } from './commands/setup.js'

const program = new Command()

program
  .name('engram')
  .description('Persistent project intelligence layer for AI coding agents')
  .version('0.1.0')

program
  .command('setup')
  .description('One-command project onboarding: init, start server, register MCP, bootstrap')
  .option('--domain <profile>', 'Domain profile (software, legal, research, general)', 'software')
  .option('--no-service', 'Skip launchd install, use per-project engram start instead')
  .option('--skip-bootstrap', 'Skip codebase bootstrap step')
  .action(async (options: { domain?: string; service?: boolean; skipBootstrap?: boolean }) => {
    await runSetup(process.cwd(), {
      domain: options.domain,
      noService: options.service === false,
      skipBootstrap: options.skipBootstrap ?? false,
    })
  })

program
  .command('init')
  .description('Initialise .engram/ in current project and configure Claude Code hooks')
  .option('--domain <profile>', 'Domain profile (software, legal, research, general)', 'software')
  .action(async (options: { domain?: string }) => {
    await runInit(process.cwd(), options.domain ?? 'software')
  })

program
  .command('start')
  .description('Start the Engram MCP server as a background process')
  .action(async () => {
    await runStart()
  })

program
  .command('stop')
  .description('Stop the running Engram server')
  .action(async () => {
    await runStop()
  })

program
  .command('status')
  .description('Show server status and active tasks')
  .action(async () => {
    await runStatus()
  })

program
  .command('task')
  .description('Show active task for current worktree')
  .option('--all', 'Show all active tasks across all worktrees')
  .action(async (options: { all?: boolean }) => {
    await runTask(process.cwd(), options.all ?? false)
  })

program
  .command('memories')
  .description('Browse stored memories in tree view')
  .option('--scope <scope>', 'Drill into a specific scope')
  .option('--type <type>', 'Filter by memory type')
  .option('--json', 'Output raw JSON')
  .action(async (options: { scope?: string; type?: string; json?: boolean }) => {
    await runMemories(options)
  })

program
  .command('invalidate <id>')
  .description('Invalidate a memory by ID')
  .action(async (id: string) => {
    await runInvalidate(id, {})
  })

program
  .command('errors')
  .description('Browse stored error patterns')
  .option('--scope <scope>', 'Filter by scope')
  .option('--json', 'Output raw JSON')
  .option('--verbose', 'Show normalized form and cause fields')
  .action(async (options: { scope?: string; json?: boolean; verbose?: boolean }) => {
    await runErrors(options)
  })

const serviceCmd = program
  .command('service')
  .description('Manage the global Engram launchd service (macOS only)')

serviceCmd
  .command('install')
  .description('Install and start the global Engram service via launchd')
  .action(async () => {
    await runServiceInstall()
  })

serviceCmd
  .command('uninstall')
  .description('Stop and remove the global Engram service')
  .action(async () => {
    await runServiceUninstall()
  })

serviceCmd
  .command('status')
  .description('Show global service status')
  .action(async () => {
    await runServiceStatus()
  })

program
  .command('update-claude-md')
  .description('Re-inject the latest Engram snippet into CLAUDE.md (idempotent)')
  .action(async () => {
    await runUpdateClaudeMd()
  })

program
  .command('bootstrap')
  .description('Analyse codebase and seed memories from existing patterns')
  .action(async () => {
    await runBootstrapCommand()
  })

program
  .command('gc')
  .description('Garbage collect low-confidence memories and prune old snapshots')
  .action(async () => {
    await runGcCommand()
  })

program
  .command('export')
  .description('Export memories to a JSON file')
  .option('--output <path>', 'Output file path')
  .option('--json', 'Print to stdout instead of writing a file')
  .action(async (options: { output?: string; json?: boolean }) => {
    await runExportCommand(process.cwd(), options)
  })

program
  .command('import <file>')
  .description('Import memories from an export file')
  .option('--replace', 'Wipe existing memories before importing')
  .action(async (file: string, options: { replace?: boolean }) => {
    await runImportCommand(file, process.cwd(), options)
  })

const apikeyCmd = program
  .command('apikey')
  .description('Manage REST API keys')

apikeyCmd
  .command('generate')
  .description('Generate a new API key (shown once)')
  .action(() => {
    runApiKeyGenerate()
  })

apikeyCmd
  .command('list')
  .description('List stored API key hashes')
  .action(() => {
    runApiKeyList()
  })

apikeyCmd
  .command('revoke <hash>')
  .description('Revoke an API key by its SHA256 hash')
  .action((hash: string) => {
    runApiKeyRevoke(hash)
  })

const observerCmd = program
  .command('observer')
  .description('Manage the Engram observer sidecar (auto-extraction from tool events)')

observerCmd
  .command('start')
  .description('Start the observer sidecar in the background')
  .action(async () => {
    await runObserverStart(process.cwd())
  })

observerCmd
  .command('stop')
  .description('Stop the running observer sidecar')
  .action(async () => {
    await runObserverStop(process.cwd())
  })

observerCmd
  .command('status')
  .description('Show observer status and buffer info')
  .action(async () => {
    await runObserverStatus(process.cwd())
  })

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
