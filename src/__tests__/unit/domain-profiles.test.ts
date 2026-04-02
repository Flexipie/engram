import { describe, it, expect, beforeEach } from 'vitest'
import { registerProfile, resolveProfile, listProfiles, SOFTWARE_SCOPES } from '../../domain/profiles.js'
import { SoftwareAdapter } from '../../domain/adapters/software.js'
import { LegalAdapter } from '../../domain/adapters/legal.js'
import { ResearchAdapter } from '../../domain/adapters/research.js'
import { GeneralAdapter } from '../../domain/adapters/general.js'

describe('domain profiles registry', () => {
  it('resolves built-in software profile', () => {
    const profile = resolveProfile('software')
    expect(profile.name).toBe('software')
    expect(profile.scopes).toContain('api')
    expect(profile.scopes).toContain('auth')
    expect(profile.scopes).toContain('general')
  })

  it('resolves built-in legal profile', () => {
    const profile = resolveProfile('legal')
    expect(profile.name).toBe('legal')
    expect(profile.scopes).toContain('litigation')
    expect(profile.scopes).toContain('general')
  })

  it('resolves built-in research profile', () => {
    const profile = resolveProfile('research')
    expect(profile.name).toBe('research')
    expect(profile.scopes).toContain('methodology')
    expect(profile.scopes).toContain('general')
  })

  it('resolves built-in general profile', () => {
    const profile = resolveProfile('general')
    expect(profile.name).toBe('general')
    expect(profile.scopes).toContain('general')
  })

  it('throws on unknown profile', () => {
    expect(() => resolveProfile('unknown-profile-xyz-not-registered')).toThrow()
  })

  it('can register and resolve custom profiles', () => {
    registerProfile({
      name: 'medical-test',
      description: 'Medical domain (test)',
      scopes: ['diagnosis', 'treatment', 'general'] as const,
      adapter: { fileToScope: () => null },
    })
    const resolved = resolveProfile('medical-test')
    expect(resolved.name).toBe('medical-test')
    expect(resolved.scopes).toContain('diagnosis')
  })

  it('listProfiles returns all registered profiles', () => {
    const profiles = listProfiles()
    expect(profiles).toContain('software')
    expect(profiles).toContain('legal')
    expect(profiles).toContain('research')
    expect(profiles).toContain('general')
  })
})

describe('SOFTWARE_SCOPES export', () => {
  it('has all 15 expected scopes', () => {
    expect(SOFTWARE_SCOPES).toContain('auth')
    expect(SOFTWARE_SCOPES).toContain('api')
    expect(SOFTWARE_SCOPES).toContain('general')
    expect(SOFTWARE_SCOPES.length).toBe(15)
  })
})

describe('SoftwareAdapter', () => {
  const adapter = new SoftwareAdapter()

  it('maps test files to testing', () => {
    expect(adapter.fileToScope('src/foo.test.ts')).toBe('testing')
    expect(adapter.fileToScope('src/__tests__/setup.ts')).toBe('testing')
  })

  it('maps auth paths to auth', () => {
    expect(adapter.fileToScope('src/auth/login.ts')).toBe('auth')
  })

  it('maps db paths to database', () => {
    expect(adapter.fileToScope('src/db/memories.ts')).toBe('database')
  })

  it('returns general for unknown paths', () => {
    expect(adapter.fileToScope('some/unknown/file.txt')).toBe('general')
  })

  it('maps api paths to api', () => {
    expect(adapter.fileToScope('src/api/users.ts')).toBe('api')
  })

  it('maps scripts to scripts', () => {
    expect(adapter.fileToScope('scripts/build.sh')).toBe('scripts')
  })
})

describe('LegalAdapter', () => {
  const adapter = new LegalAdapter()

  it('returns null for all paths (no file-based mapping)', () => {
    expect(adapter.fileToScope('src/auth/login.ts')).toBeNull()
    expect(adapter.fileToScope('some/file.ts')).toBeNull()
  })
})

describe('ResearchAdapter', () => {
  const adapter = new ResearchAdapter()

  it('returns null for all paths', () => {
    expect(adapter.fileToScope('some/file.ts')).toBeNull()
  })
})

describe('GeneralAdapter', () => {
  const adapter = new GeneralAdapter()

  it('always returns null', () => {
    expect(adapter.fileToScope('src/auth/login.ts')).toBeNull()
    expect(adapter.fileToScope('any/path.ts')).toBeNull()
  })
})
