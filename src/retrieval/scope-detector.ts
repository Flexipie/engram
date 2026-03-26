import { execa } from 'execa'

type Scope = 'auth' | 'api' | 'components' | 'database' | 'testing' | 'config' | 'general'

function fileToScope(filePath: string): Scope {
  // Testing patterns (check first — test files in any dir)
  if (/\.(test|spec)\.[a-z]+$/.test(filePath)) return 'testing'
  if (/__tests__\//.test(filePath)) return 'testing'

  // Auth
  if (/^src\/auth\//.test(filePath)) return 'auth'

  // API
  if (/^src\/api\//.test(filePath)) return 'api'

  // Components / UI
  if (/^src\/components\//.test(filePath)) return 'components'
  if (/^src\/ui\//.test(filePath)) return 'components'

  // Database
  if (/^src\/db\//.test(filePath)) return 'database'
  if (/src\/[^/]*db[^/]*\//.test(filePath)) return 'database'

  // Config
  if (/^src\/config\//.test(filePath)) return 'config'
  if (/\.config\.[a-z]+$/.test(filePath)) return 'config'

  return 'general'
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

    const scopes = [...new Set(files.map(fileToScope))]
    return scopes
  } catch {
    return ['general']
  }
}
