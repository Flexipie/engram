export interface DomainAdapter {
  fileToScope(filePath: string): string | null  // null → caller uses 'general'
}

export interface DomainProfile {
  name: string
  description: string
  scopes: readonly string[]
  adapter: DomainAdapter
}

export const SOFTWARE_SCOPES = [
  'auth', 'api', 'components', 'database', 'testing', 'config', 'general',
  'build', 'types', 'utils', 'services', 'state', 'routing', 'infra', 'scripts',
] as const

const registry = new Map<string, DomainProfile>()

export function registerProfile(profile: DomainProfile): void {
  registry.set(profile.name, profile)
}

export function resolveProfile(name: string): DomainProfile {
  const profile = registry.get(name)
  if (!profile) {
    throw new Error(`Unknown domain profile: "${name}". Known profiles: ${[...registry.keys()].join(', ')}`)
  }
  return profile
}

export function listProfiles(): string[] {
  return [...registry.keys()]
}

// Built-in profiles are registered at module load by importing the adapter files.
// They call registerProfile() on import.
