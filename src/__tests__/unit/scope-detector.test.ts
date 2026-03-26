import { describe, it, expect, vi, beforeEach } from 'vitest'
import { detectScopes } from '../../retrieval/scope-detector.js'

// Mock execa to control git output
vi.mock('execa', () => ({
  execa: vi.fn(),
}))

import { execa } from 'execa'

const mockExeca = vi.mocked(execa)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('detectScopes', () => {
  it('returns ["testing"] for *.test.ts files', async () => {
    mockExeca.mockResolvedValueOnce({
      stdout: 'M  src/utils/helper.test.ts',
      stderr: '',
      exitCode: 0,
    } as never)

    const scopes = await detectScopes('/some/path')
    expect(scopes).toEqual(['testing'])
  })

  it('returns ["testing"] for *.spec.ts files', async () => {
    mockExeca.mockResolvedValueOnce({
      stdout: 'M  src/utils/helper.spec.ts',
      stderr: '',
      exitCode: 0,
    } as never)

    const scopes = await detectScopes('/some/path')
    expect(scopes).toEqual(['testing'])
  })

  it('returns ["auth"] for src/auth/session.ts', async () => {
    mockExeca.mockResolvedValueOnce({
      stdout: 'M  src/auth/session.ts',
      stderr: '',
      exitCode: 0,
    } as never)

    const scopes = await detectScopes('/some/path')
    expect(scopes).toEqual(['auth'])
  })

  it('returns ["api"] for src/api/routes.ts', async () => {
    mockExeca.mockResolvedValueOnce({
      stdout: 'M  src/api/routes.ts',
      stderr: '',
      exitCode: 0,
    } as never)

    const scopes = await detectScopes('/some/path')
    expect(scopes).toEqual(['api'])
  })

  it('returns ["components"] for src/components/Button.tsx', async () => {
    mockExeca.mockResolvedValueOnce({
      stdout: 'M  src/components/Button.tsx',
      stderr: '',
      exitCode: 0,
    } as never)

    const scopes = await detectScopes('/some/path')
    expect(scopes).toEqual(['components'])
  })

  it('returns ["components"] for src/ui/Modal.tsx', async () => {
    mockExeca.mockResolvedValueOnce({
      stdout: 'M  src/ui/Modal.tsx',
      stderr: '',
      exitCode: 0,
    } as never)

    const scopes = await detectScopes('/some/path')
    expect(scopes).toEqual(['components'])
  })

  it('returns ["database"] for src/db/schema.ts', async () => {
    mockExeca.mockResolvedValueOnce({
      stdout: 'M  src/db/schema.ts',
      stderr: '',
      exitCode: 0,
    } as never)

    const scopes = await detectScopes('/some/path')
    expect(scopes).toEqual(['database'])
  })

  it('returns ["config"] for src/config/settings.ts', async () => {
    mockExeca.mockResolvedValueOnce({
      stdout: 'M  src/config/settings.ts',
      stderr: '',
      exitCode: 0,
    } as never)

    const scopes = await detectScopes('/some/path')
    expect(scopes).toEqual(['config'])
  })

  it('returns ["config"] for *.config.ts files', async () => {
    mockExeca.mockResolvedValueOnce({
      stdout: 'M  vitest.config.ts',
      stderr: '',
      exitCode: 0,
    } as never)

    const scopes = await detectScopes('/some/path')
    expect(scopes).toEqual(['config'])
  })

  it('returns ["general"] when git fails', async () => {
    mockExeca.mockRejectedValueOnce(new Error('git: not a repository'))

    const scopes = await detectScopes('/some/path')
    expect(scopes).toEqual(['general'])
  })

  it('returns ["general"] for empty git status', async () => {
    mockExeca.mockResolvedValueOnce({
      stdout: '',
      stderr: '',
      exitCode: 0,
    } as never)

    const scopes = await detectScopes('/some/path')
    expect(scopes).toEqual(['general'])
  })

  it('returns deduplicated scopes for mixed files', async () => {
    mockExeca.mockResolvedValueOnce({
      stdout: [
        'M  src/auth/login.ts',
        'M  src/auth/logout.ts',
        'M  src/api/auth.ts',
        'M  src/utils/helper.test.ts',
      ].join('\n'),
      stderr: '',
      exitCode: 0,
    } as never)

    const scopes = await detectScopes('/some/path')
    expect(scopes).toHaveLength(3)
    expect(scopes).toContain('auth')
    expect(scopes).toContain('api')
    expect(scopes).toContain('testing')
    // No duplicates
    expect(new Set(scopes).size).toBe(scopes.length)
  })

  it('returns ["general"] for files that match no pattern', async () => {
    mockExeca.mockResolvedValueOnce({
      stdout: 'M  README.md',
      stderr: '',
      exitCode: 0,
    } as never)

    const scopes = await detectScopes('/some/path')
    expect(scopes).toEqual(['general'])
  })
})
