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

const program = new Command()

program
  .name('engram')
  .description('Persistent project intelligence layer for AI coding agents')
  .version('0.1.0')

program
  .command('init')
  .description('Initialise .engram/ in current project and configure Claude Code hooks')
  .action(async () => {
    await runInit()
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

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
