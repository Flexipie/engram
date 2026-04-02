// Import adapters to register built-in profiles
import './adapters/software.js'
import './adapters/legal.js'
import './adapters/research.js'
import './adapters/general.js'

import { resolveProfile, type DomainProfile, type DomainAdapter } from './profiles.js'

let activeProfileName = 'software'

export function setActiveProfile(name: string): void {
  // Validate by resolving (throws if not found)
  resolveProfile(name)
  activeProfileName = name
}

export function getActiveProfile(): DomainProfile {
  return resolveProfile(activeProfileName)
}

export function getActiveScopes(): readonly string[] {
  return getActiveProfile().scopes
}

export function getActiveScopeAdapter(): DomainAdapter {
  return getActiveProfile().adapter
}
