import { execa } from 'execa'
import { getActiveScopeAdapter } from '../domain/active-profile.js'

export function fileToScope(filePath: string): string {
  const result = getActiveScopeAdapter().fileToScope(filePath)
  return result ?? 'general'
}

function parseGitStatus(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      // git status --short format: "XY filename" or "XY old -> new"
      // Strip the 2-char status prefix
      return line.replace(/^[A-Z?! ]{1,2}\s+/, '').trim()
    })
    .filter((f) => f.length > 0)
}

export async function detectScopes(worktreePath: string): Promise<string[]> {
  try {
    const result = await execa('git', ['status', '--short'], { cwd: worktreePath })
    const files = parseGitStatus(result.stdout)

    if (files.length === 0) return ['general']

    const scopes = [...new Set(files.map((f) => fileToScope(f)))]
    return scopes
  } catch {
    return ['general']
  }
}
