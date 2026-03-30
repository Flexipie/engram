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

  // Try to get live stats from health endpoint
  try {
    const resp = await fetch(`http://localhost:${port}/health`)
    if (resp.ok) {
      const health = (await resp.json()) as {
        status: string
        version: string
        active_worktrees: number
        enforcement?: { checks: number; violations: number; warnings: number }
      }
      console.log(`  Status:    ${chalk.green(health.status)}`)
      console.log(`  Version:   ${chalk.gray(health.version)}`)
      console.log(`  Worktrees: ${chalk.cyan(String(health.active_worktrees))} active`)
      if (health.enforcement) {
        const { checks, violations, warnings } = health.enforcement
        console.log(
          `  Enforce:   ${chalk.cyan(String(checks))} checks, ` +
          `${violations > 0 ? chalk.red(String(violations)) : chalk.gray('0')} violations, ` +
          `${warnings > 0 ? chalk.yellow(String(warnings)) : chalk.gray('0')} warnings`,
        )
      }
    }
  } catch {
    // Server may be starting
  }
}
