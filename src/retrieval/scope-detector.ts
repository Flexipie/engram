import { execa } from 'execa'
import type { MemoryScope } from '../db/memories.js'

export function fileToScope(filePath: string): MemoryScope {
  const f = filePath

  // Testing patterns (check first — test files in any dir)
  if (/\.(test|spec)\.[a-z]+$/.test(f)) return 'testing'
  if (/__tests__\//.test(f)) return 'testing'

  // Auth
  if (/^src\/auth\//.test(f)) return 'auth'

  // API
  if (/^src\/api\//.test(f)) return 'api'

  // Components / UI
  if (/^src\/components\//.test(f)) return 'components'
  if (/^src\/ui\//.test(f)) return 'components'

  // Database
  if (/^src\/db\//.test(f)) return 'database'
  if (/src\/[^/]*db[^/]*\//.test(f)) return 'database'

  // Utils
  if (/^src\/utils\//.test(f) || /\/utils\//.test(f)) return 'utils'

  // Services
  if (/^src\/services\//.test(f)) return 'services'

  // Types
  if (/^src\/types\//.test(f) || /\.types\.[a-z]+$/.test(f)) return 'types'

  // State / store
  if (/^src\/state\//.test(f) || /\/store\//.test(f)) return 'state'

  // Routing
  if (/^src\/routing\//.test(f) || /\/routes\//.test(f)) return 'routing'

  // Infrastructure
  if (/^src\/infra\//.test(f) || /\/infrastructure\//.test(f)) return 'infra'

  // Scripts
  if (/^scripts\//.test(f)) return 'scripts'

  // Build tooling (specific tool names take priority over generic config)
  if (/(?:webpack|rollup|tsup|babel|eslint|prettier)\.config/.test(f)) return 'build'
  if (/^(Makefile|Dockerfile|\.github\/)/.test(f)) return 'build'

  // Config (generic)
  if (/^src\/config\//.test(f)) return 'config'
  if (/\.config\.[a-z]+$/.test(f)) return 'config'

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

    const scopes = [...new Set(files.map((f) => fileToScope(f)))]
    return scopes
  } catch {
    return ['general']
  }
}
