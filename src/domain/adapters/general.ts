import { registerProfile, type DomainAdapter } from '../profiles.js'

export class GeneralAdapter implements DomainAdapter {
  fileToScope(_filePath: string): string | null {
    return null
  }
}

registerProfile({
  name: 'general',
  description: 'Generic domain — single scope for any use case',
  scopes: ['general'] as const,
  adapter: new GeneralAdapter(),
})
