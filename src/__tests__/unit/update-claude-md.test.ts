import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { injectClaudeMd } from '../../cli/utils/inject-claude-md.js'

const SENTINEL_START = '<!-- engram:start -->'
const SENTINEL_END = '<!-- engram:end -->'

function makeTestDir(): string {
  const dir = join(
    tmpdir(),
    `engram-claude-md-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('injectClaudeMd', () => {
  let testDir: string

  beforeEach(() => {
    testDir = makeTestDir()
  })

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true })
  })

  it('creates CLAUDE.md if missing, returns created', () => {
    const result = injectClaudeMd(testDir)
    expect(result).toBe('created')
    expect(existsSync(join(testDir, 'CLAUDE.md'))).toBe(true)
  })

  it('returns unchanged on second call with same content', () => {
    injectClaudeMd(testDir)
    const result = injectClaudeMd(testDir)
    expect(result).toBe('unchanged')
  })

  it('replaces content between sentinels when outdated', () => {
    const claudeMdPath = join(testDir, 'CLAUDE.md')
    writeFileSync(claudeMdPath, `${SENTINEL_START}\nOld outdated content\n${SENTINEL_END}`, 'utf-8')
    const result = injectClaudeMd(testDir)
    expect(result).toBe('updated')
    const content = readFileSync(claudeMdPath, 'utf-8')
    expect(content).not.toContain('Old outdated content')
    expect(content).toContain(SENTINEL_START)
    expect(content).toContain(SENTINEL_END)
  })

  it('appends if no sentinels found in existing file, returns updated', () => {
    const claudeMdPath = join(testDir, 'CLAUDE.md')
    writeFileSync(claudeMdPath, '# Existing Content\nSome existing text\n', 'utf-8')
    const result = injectClaudeMd(testDir)
    expect(result).toBe('updated')
    const content = readFileSync(claudeMdPath, 'utf-8')
    expect(content).toContain('# Existing Content')
    expect(content).toContain(SENTINEL_START)
  })

  it('preserves content outside sentinels', () => {
    const claudeMdPath = join(testDir, 'CLAUDE.md')
    writeFileSync(
      claudeMdPath,
      `# Before\n${SENTINEL_START}\nOld content\n${SENTINEL_END}\n# After`,
      'utf-8',
    )
    injectClaudeMd(testDir)
    const content = readFileSync(claudeMdPath, 'utf-8')
    expect(content).toContain('# Before')
    expect(content).toContain('# After')
  })

  it('returns updated when sentinels existed with different content', () => {
    const claudeMdPath = join(testDir, 'CLAUDE.md')
    writeFileSync(
      claudeMdPath,
      `${SENTINEL_START}\nCompletely different old content here\n${SENTINEL_END}`,
      'utf-8',
    )
    const result = injectClaudeMd(testDir)
    expect(result).toBe('updated')
  })

  it('created CLAUDE.md contains sentinel markers', () => {
    injectClaudeMd(testDir)
    const content = readFileSync(join(testDir, 'CLAUDE.md'), 'utf-8')
    expect(content).toContain(SENTINEL_START)
    expect(content).toContain(SENTINEL_END)
  })
})
