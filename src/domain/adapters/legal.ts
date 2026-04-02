import { registerProfile, type DomainAdapter } from '../profiles.js'

const LEGAL_SCOPES = ['litigation', 'contracts', 'due_diligence', 'regulatory', 'research', 'general'] as const

export class LegalAdapter implements DomainAdapter {
  fileToScope(_filePath: string): string | null {
    // Legal domain has no file-path-based scope detection
    return null
  }
}

registerProfile({
  name: 'legal',
  description: 'Legal practice — litigation, contracts, due diligence, regulatory, research',
  scopes: LEGAL_SCOPES,
  adapter: new LegalAdapter(),
})
