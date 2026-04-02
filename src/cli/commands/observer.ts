import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import chalk from 'chalk'

const __dirname = dirname(fileURLToPath(import.meta.url))

function getPidFile(projectDir: string): string {
  return join(projectDir, '.engram', 'observer.pid')
}

function readPid(pidFile: string): number | null {
  if (!existsSync(pidFile)) return null
  try {
    const pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10)
    return isNaN(pid) ? null : pid
  } catch {
    return null
  }
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export async function runObserverStart(projectDir: string = process.cwd()): Promise<void> {
  const pidFile = getPidFile(projectDir)
  const existingPid = readPid(pidFile)

  if (existingPid !== null && isRunning(existingPid)) {
    console.log(chalk.yellow(`Observer already running (PID ${existingPid})`))
    return
  }

  const engramDir = join(projectDir, '.engram')
  mkdirSync(engramDir, { recursive: true })

  // Resolve observer entry point
  const observerEntry = join(__dirname, '../../observer/index.js')
  if (!existsSync(observerEntry)) {
    console.error(chalk.red(`Observer entry not found: ${observerEntry}`))
    console.error(chalk.red('Run `npm run build` first'))
    process.exit(1)
  }

  const logFile = join(engramDir, 'observer.log')

  const child = spawn(process.execPath, [observerEntry], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ENGRAM_PROJECT_DIR: projectDir },
  })

  // Write log output
  const { createWriteStream } = await import('fs')
  const logStream = createWriteStream(logFile, { flags: 'a' })
  child.stdout?.pipe(logStream)
  child.stderr?.pipe(logStream)

  child.unref()

  writeFileSync(pidFile, String(child.pid), 'utf-8')

  console.log(chalk.green(`Observer started (PID ${child.pid})`))
  console.log(chalk.gray(`  Log: ${logFile}`))
}

export async function runObserverStop(projectDir: string = process.cwd()): Promise<void> {
  const pidFile = getPidFile(projectDir)
  const pid = readPid(pidFile)

  if (pid === null) {
    console.log(chalk.yellow('Observer is not running (no PID file)'))
    return
  }

  if (!isRunning(pid)) {
    console.log(chalk.yellow(`Observer was not running (PID ${pid} gone), cleaning up`))
    try {
      const { unlinkSync } = await import('fs')
      unlinkSync(pidFile)
    } catch { /* ignore */ }
    return
  }

  try {
    process.kill(pid, 'SIGTERM')
    console.log(chalk.green(`Observer stopped (PID ${pid})`))
    const { unlinkSync } = await import('fs')
    unlinkSync(pidFile)
  } catch (err) {
    console.error(chalk.red(`Failed to stop observer: ${String(err)}`))
  }
}

export async function runObserverStatus(projectDir: string = process.cwd()): Promise<void> {
  const pidFile = getPidFile(projectDir)
  const pid = readPid(pidFile)

  if (pid === null) {
    console.log(chalk.yellow('Observer: stopped'))
    return
  }

  if (!isRunning(pid)) {
    console.log(chalk.yellow(`Observer: stopped (stale PID ${pid})`))
    return
  }

  console.log(chalk.green(`Observer: running (PID ${pid})`))

  // Try to get health from observer
  try {
    const { loadConfig } = await import('../../config.js')
    const config = loadConfig(projectDir)
    const res = await fetch(`http://127.0.0.1:${config.observer.port}/health`, {
      signal: AbortSignal.timeout(2_000),
    })
    if (res.ok) {
      const data = await res.json() as { buffer_size: number; last_flush: string | null }
      console.log(chalk.gray(`  Buffer size: ${data.buffer_size}`))
      console.log(chalk.gray(`  Last flush:  ${data.last_flush ?? 'never'}`))
    }
  } catch { /* server not reachable */ }
}
