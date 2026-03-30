import { existsSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import chalk from 'chalk'

interface RunningInfo {
  pid: number
  port: number
  started_at: string
  mode?: 'global' | 'project'
  project_dir?: string | null
}

async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      process.kill(pid, 0)
      // Still alive
    } catch {
      return true // Process is gone
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  return false
}

export async function runStop(projectDir: string = process.cwd()): Promise<void> {
  // Check global service first (~/.engram/running.json), then per-project
  const globalRunningFile = join(homedir(), '.engram', 'running.json')
  const projectRunningFile = join(projectDir, '.engram', 'running.json')

  const runningFile = existsSync(globalRunningFile)
    ? globalRunningFile
    : projectRunningFile

  const engramDir = existsSync(globalRunningFile)
    ? join(homedir(), '.engram')
    : join(projectDir, '.engram')

  const pidFile = join(engramDir, 'engram.pid')

  if (!existsSync(runningFile)) {
    console.log(chalk.yellow('Engram is not running (no running.json found)'))
    return
  }

  let info: RunningInfo
  try {
    info = JSON.parse(readFileSync(runningFile, 'utf-8')) as RunningInfo
  } catch {
    console.error(chalk.red('Could not read running.json'))
    process.exit(1)
  }

  const { pid } = info

  // Check if process is alive
  try {
    process.kill(pid, 0)
  } catch {
    console.log(chalk.yellow(`Process ${pid} is not running. Cleaning up...`))
    if (existsSync(runningFile)) rmSync(runningFile)
    if (existsSync(pidFile)) rmSync(pidFile)
    return
  }

  console.log(chalk.gray(`Sending SIGTERM to pid ${pid}...`))
  process.kill(pid, 'SIGTERM')

  const exited = await waitForExit(pid, 5000)
  if (!exited) {
    console.log(chalk.yellow('Process did not exit in 5s, sending SIGKILL...'))
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // Already dead
    }
  }

  if (existsSync(runningFile)) rmSync(runningFile)
  if (existsSync(pidFile)) rmSync(pidFile)

  console.log(chalk.green('Engram stopped.'))
}
