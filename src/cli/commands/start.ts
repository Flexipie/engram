import { existsSync, writeFileSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'
import chalk from 'chalk'
import { loadConfig } from '../../config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface RunningInfo {
  pid: number
  port: number
  started_at: string
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

export async function runStart(projectDir: string = process.cwd()): Promise<void> {
  const engramDir = join(projectDir, '.engram')
  const runningFile = join(engramDir, 'running.json')

  // Check if already running
  if (existsSync(runningFile)) {
    try {
      const info = JSON.parse(readFileSync(runningFile, 'utf-8')) as RunningInfo
      // Check if process is actually alive
      try {
        process.kill(info.pid, 0)
        console.log(chalk.yellow(`Engram is already running (pid ${info.pid} on port ${info.port})`))
        return
      } catch {
        // Process is dead, clean up stale file
        console.log(chalk.gray('Stale running.json found, starting fresh...'))
      }
    } catch {
      // Corrupt file, ignore
    }
  }

  const config = loadConfig(projectDir)
  const port = Number(process.env.ENGRAM_PORT ?? config.port)

  // Find the server entry point
  const serverScript = join(__dirname, '../server.js')
  if (!existsSync(serverScript)) {
    console.error(chalk.red('Error: dist/server.js not found. Run `npm run build` first.'))
    process.exit(1)
  }

  // Check if port is already in use (global service may be running)
  try {
    const resp = await fetch(`http://localhost:${port}/health`)
    if (resp.ok) {
      const data = await resp.json() as { mode?: string }
      const modeStr = data.mode === 'global' ? ' (global service)' : ''
      console.log(chalk.yellow(`Port ${port} already in use${modeStr}. Engram may already be running.`))
      console.log(chalk.gray('  Use `engram service status` to check the global service.'))
      return
    }
  } catch {
    // Port is free — proceed
  }

  console.log(chalk.bold('\nStarting Engram server...\n'))

  const child = spawn('node', [serverScript], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      ENGRAM_PROJECT_DIR: projectDir,
      ENGRAM_PORT: String(port),
    },
  })
  child.unref()

  console.log(chalk.gray(`Spawned server (pid ${child.pid}), waiting for ready...`))

  const ready = await pollHealth(port)
  if (ready) {
    console.log(chalk.green(`\nEngram server is running!`))
    console.log(`  Port: ${chalk.cyan(String(port))}`)
    console.log(`  MCP:  ${chalk.cyan(`http://localhost:${port}/mcp`)}`)
    console.log(`  PID:  ${chalk.cyan(String(child.pid))}`)
  } else {
    console.error(chalk.red('\nServer did not become ready within 5s. Check logs.'))
    process.exit(1)
  }
}
