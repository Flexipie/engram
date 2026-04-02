import { registerProfile, type DomainAdapter } from '../profiles.js'

const RESEARCH_SCOPES = ['methodology', 'literature', 'data', 'analysis', 'writing', 'citations', 'general'] as const

export class ResearchAdapter implements DomainAdapter {
  fileToScope(_filePath: string): string | null {
    return null
  }
}

registerProfile({
  name: 'research',
  description: 'Academic and scientific research — methodology, literature, data, analysis, writing',
  scopes: RESEARCH_SCOPES,
  adapter: new ResearchAdapter(),
})
