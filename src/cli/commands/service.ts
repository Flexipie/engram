import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { homedir } from 'os'
import { execa } from 'execa'
import chalk from 'chalk'
import { generatePlist, getServiceLabel, getPlistPath } from '../../service/installer.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

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

export async function runServiceInstall(): Promise<void> {
  if (process.platform !== 'darwin') {
    console.error(chalk.red('Error: engram service install only supports macOS (launchd)'))
    process.exit(1)
  }

  const logDir = join(homedir(), '.engram', 'logs')
  mkdirSync(logDir, { recursive: true })

  // CLI bundled to dist/cli/index.js; server at dist/server.js
  const nodePath = process.execPath
  const serverPath = join(__dirname, '../server.js')

  if (!existsSync(serverPath)) {
    console.error(chalk.red(`Error: server not found at ${serverPath}. Run \`npm run build\` first.`))
    process.exit(1)
  }

  const label = getServiceLabel()
  const plistPath = getPlistPath()
  const plist = generatePlist({ label, nodePath, serverPath, port: 7337, logDir })

  writeFileSync(plistPath, plist, 'utf-8')
  console.log(chalk.gray(`Written plist to ${plistPath}`))

  // Bootstrap the service (bootout first if already loaded)
  const uid = (process as NodeJS.Process & { getuid?(): number }).getuid?.() ?? 501
  const target = `gui/${uid}`

  try {
    await execa('launchctl', ['bootout', target, plistPath])
  } catch {
    // Not loaded yet — ignore
  }

  await execa('launchctl', ['bootstrap', target, plistPath])

  console.log(chalk.gray('Waiting for service to start...'))
  const ready = await pollHealth(7337)

  if (ready) {
    console.log(chalk.green('\u2713 Engram global service running'))
    console.log(`  Port: ${chalk.cyan('7337')}`)
    console.log(`  MCP:  ${chalk.cyan('http://localhost:7337/mcp')}`)
    console.log(`  Plist: ${chalk.gray(plistPath)}`)
  } else {
    console.error(chalk.red('Service did not start within 5s. Check logs at ' + logDir))
    process.exit(1)
  }
}

export async function runServiceUninstall(): Promise<void> {
  if (process.platform !== 'darwin') {
    console.error(chalk.red('Error: engram service uninstall only supports macOS (launchd)'))
    process.exit(1)
  }

  const plistPath = getPlistPath()
  const uid = (process as NodeJS.Process & { getuid?(): number }).getuid?.() ?? 501
  const target = `gui/${uid}`

  try {
    await execa('launchctl', ['bootout', target, plistPath])
    console.log(chalk.green('Service stopped'))
  } catch {
    console.log(chalk.yellow('Service was not running'))
  }

  if (existsSync(plistPath)) {
    rmSync(plistPath)
    console.log(chalk.green('Plist removed'))
  }

  console.log(chalk.green('Engram service uninstalled'))
}

export async function runServiceStatus(): Promise<void> {
  const plistPath = getPlistPath()

  if (!existsSync(plistPath)) {
    console.log(chalk.yellow('Engram service is not installed (no plist found)'))
    return
  }

  console.log(chalk.gray(`Plist: ${plistPath}`))

  try {
    const resp = await fetch('http://localhost:7337/health')
    if (resp.ok) {
      const data = await resp.json() as { uptime: number; active_worktrees: number; mode?: string }
      console.log(chalk.green('\u2713 Running'))
      console.log(`  Uptime:           ${data.uptime}s`)
      console.log(`  Active worktrees: ${data.active_worktrees}`)
      if (data.mode) console.log(`  Mode:             ${data.mode}`)
    } else {
      console.log(chalk.yellow('\u26a0 Installed but not responding'))
    }
  } catch {
    console.log(chalk.yellow('\u26a0 Installed but not running'))
  }
}
