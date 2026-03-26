import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { execa } from 'execa'

// E2E tests for `engram init` command
// These tests require the built binary. Run `npm run build` first.

const BINARY = new URL('../../../dist/cli/index.js', import.meta.url).pathname

describe('engram init (e2e)', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'engram-e2e-init-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it.todo('creates .engram/ directory', async () => {
    // Requires built binary
    await execa('node', [BINARY, 'init'], { cwd: tmpDir })
    expect(existsSync(join(tmpDir, '.engram'))).toBe(true)
  })

  it.todo('creates .engram/config.json', async () => {
    await execa('node', [BINARY, 'init'], { cwd: tmpDir })
    expect(existsSync(join(tmpDir, '.engram', 'config.json'))).toBe(true)
  })

  it.todo('creates .engram/hooks/enforce.sh', async () => {
    await execa('node', [BINARY, 'init'], { cwd: tmpDir })
    expect(existsSync(join(tmpDir, '.engram', 'hooks', 'enforce.sh'))).toBe(true)
  })

  it.todo('creates .engram/hooks/snapshot.sh', async () => {
    await execa('node', [BINARY, 'init'], { cwd: tmpDir })
    expect(existsSync(join(tmpDir, '.engram', 'hooks', 'snapshot.sh'))).toBe(true)
  })

  it.todo('creates .engram/hooks/heartbeat.sh', async () => {
    await execa('node', [BINARY, 'init'], { cwd: tmpDir })
    expect(existsSync(join(tmpDir, '.engram', 'hooks', 'heartbeat.sh'))).toBe(true)
  })

  it.todo('creates CLAUDE.md with sentinel block if not exists', async () => {
    await execa('node', [BINARY, 'init'], { cwd: tmpDir })
    const content = await readFile(join(tmpDir, 'CLAUDE.md'), 'utf-8')
    expect(content).toContain('<!-- engram:start -->')
    expect(content).toContain('<!-- engram:end -->')
  })

  it.todo('init is idempotent: running twice does not duplicate sentinel block', async () => {
    await execa('node', [BINARY, 'init'], { cwd: tmpDir })
    await execa('node', [BINARY, 'init'], { cwd: tmpDir })
    const content = await readFile(join(tmpDir, 'CLAUDE.md'), 'utf-8')
    const startCount = (content.match(/<!-- engram:start -->/g) || []).length
    expect(startCount).toBe(1)
  })

  it.todo('creates .claude/settings.json if missing', async () => {
    await execa('node', [BINARY, 'init'], { cwd: tmpDir })
    expect(existsSync(join(tmpDir, '.claude', 'settings.json'))).toBe(true)
  })

  it.todo('adds hooks to existing .claude/settings.json without duplicating', async () => {
    // Pre-create settings.json with existing content
    const claudeDir = join(tmpDir, '.claude')
    await mkdir(claudeDir, { recursive: true })
    await writeFile(
      join(claudeDir, 'settings.json'),
      JSON.stringify({ theme: 'dark' }, null, 2),
      'utf-8',
    )

    await execa('node', [BINARY, 'init'], { cwd: tmpDir })
    await execa('node', [BINARY, 'init'], { cwd: tmpDir })

    const settings = JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf-8'))
    // Should have hooks but not duplicated
    expect(settings.hooks).toBeDefined()
    expect(settings.hooks.PreCompact).toHaveLength(1)
  })
})
