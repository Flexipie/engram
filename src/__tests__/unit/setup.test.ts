import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

function makeTestDir(): string {
  const dir = join(
    tmpdir(),
    `engram-setup-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  mkdirSync(dir, { recursive: true })
  return dir
}

// Mock heavy external dependencies
vi.mock('../../cli/commands/init.js', () => ({
  runInit: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../cli/commands/service.js', () => ({
  runServiceInstall: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../cli/commands/start.js', () => ({
  runStart: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../cli/commands/bootstrap.js', () => ({
  runBootstrapCommand: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../cli/utils/inject-mcp-config.js', () => ({
  injectMcpConfig: vi.fn().mockReturnValue('created'),
}))

describe('runSetup', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = makeTestDir()
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true })
  })

  it('calls runInit with the correct domain', async () => {
    const { runInit } = await import('../../cli/commands/init.js')
    const { runSetup } = await import('../../cli/commands/setup.js')
    await runSetup(testDir, { domain: 'legal', noService: true, skipBootstrap: true })
    expect(runInit).toHaveBeenCalledWith(testDir, 'legal')
  })

  it('defaults to software domain', async () => {
    const { runInit } = await import('../../cli/commands/init.js')
    const { runSetup } = await import('../../cli/commands/setup.js')
    await runSetup(testDir, { noService: true, skipBootstrap: true })
    expect(runInit).toHaveBeenCalledWith(testDir, 'software')
  })

  it('injects MCP config into project .claude/settings.json', async () => {
    const { injectMcpConfig } = await import('../../cli/utils/inject-mcp-config.js')
    const { runSetup } = await import('../../cli/commands/setup.js')
    await runSetup(testDir, { noService: true, skipBootstrap: true })
    const projectSettings = join(testDir, '.claude', 'settings.json')
    expect(injectMcpConfig).toHaveBeenCalledWith(projectSettings, expect.any(Number))
  })

  it('injects MCP config into user ~/.claude/settings.json', async () => {
    const { injectMcpConfig } = await import('../../cli/utils/inject-mcp-config.js')
    const { runSetup } = await import('../../cli/commands/setup.js')
    const { homedir } = await import('os')
    await runSetup(testDir, { noService: true, skipBootstrap: true })
    const userSettings = join(homedir(), '.claude', 'settings.json')
    expect(injectMcpConfig).toHaveBeenCalledWith(userSettings, expect.any(Number))
  })

  it('skips bootstrap with --skip-bootstrap flag', async () => {
    const { runBootstrapCommand } = await import('../../cli/commands/bootstrap.js')
    const { runSetup } = await import('../../cli/commands/setup.js')
    await runSetup(testDir, { noService: true, skipBootstrap: true })
    expect(runBootstrapCommand).not.toHaveBeenCalled()
  })

  it('runs bootstrap without --skip-bootstrap flag', async () => {
    const { runBootstrapCommand } = await import('../../cli/commands/bootstrap.js')
    const { runSetup } = await import('../../cli/commands/setup.js')
    // bootstrap is called but may throw if DB not ready — that's ok, it's caught
    await runSetup(testDir, { noService: true, skipBootstrap: false })
    expect(runBootstrapCommand).toHaveBeenCalledWith(testDir)
  })

  it('skips service install with --no-service, calls runStart instead', async () => {
    const { runServiceInstall } = await import('../../cli/commands/service.js')
    const { runStart } = await import('../../cli/commands/start.js')
    const { runSetup } = await import('../../cli/commands/setup.js')
    await runSetup(testDir, { noService: true, skipBootstrap: true })
    expect(runServiceInstall).not.toHaveBeenCalled()
    expect(runStart).toHaveBeenCalled()
  })

  it('is idempotent — running twice calls runInit both times (idempotent by design)', async () => {
    const { runInit } = await import('../../cli/commands/init.js')
    const { runSetup } = await import('../../cli/commands/setup.js')
    await runSetup(testDir, { noService: true, skipBootstrap: true })
    await runSetup(testDir, { noService: true, skipBootstrap: true })
    expect(runInit).toHaveBeenCalledTimes(2)
  }, 15_000)
})
