import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import chalk from 'chalk'

interface RunningInfo {
  pid: number
  port: number
  started_at: string
}

export async function runStatus(projectDir: string = process.cwd()): Promise<void> {
  const engramDir = join(projectDir, '.engram')
  const runningFile = join(engramDir, 'running.json')

  if (!existsSync(runningFile)) {
    console.log(chalk.yellow('Engram: stopped'))
    return
  }

  let info: RunningInfo
  try {
    info = JSON.parse(readFileSync(runningFile, 'utf-8')) as RunningInfo
  } catch {
    console.log(chalk.yellow('Engram: stopped (corrupt running.json)'))
    return
  }

  const { pid, port, started_at } = info

  // Check if process is alive
  let alive = false
  try {
    process.kill(pid, 0)
    alive = true
  } catch {
    alive = false
  }

  if (!alive) {
    console.log(chalk.yellow('Engram: stopped (stale pid)'))
    return
  }

  const uptimeSec = Math.floor((Date.now() - new Date(started_at).getTime()) / 1000)
  const uptimeStr =
    uptimeSec < 60
      ? `${uptimeSec}s`
      : uptimeSec < 3600
        ? `${Math.floor(uptimeSec / 60)}m ${uptimeSec % 60}s`
        : `${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m`

  console.log(chalk.green('Engram: running'))
  console.log(`  PID:    ${chalk.cyan(String(pid))}`)
  console.log(`  Port:   ${chalk.cyan(String(port))}`)
  console.log(`  Uptime: ${chalk.cyan(uptimeStr)}`)
  console.log(`  MCP:    ${chalk.cyan(`http://localhost:${port}/mcp`)}`)

  // Try to get active tasks count from health endpoint
  try {
    const resp = await fetch(`http://localhost:${port}/health`)
    if (resp.ok) {
      const health = (await resp.json()) as { status: string; version: string }
      console.log(`  Status: ${chalk.green(health.status)}`)
      console.log(`  Version: ${chalk.gray(health.version)}`)
    }
  } catch {
    // Server may be starting
  }
}
