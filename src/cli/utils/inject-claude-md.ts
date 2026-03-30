import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const SENTINEL_START = '<!-- engram:start -->'
const SENTINEL_END = '<!-- engram:end -->'

function getSnippet(): string {
  // In production (bundled to dist/cli/index.js): __dirname = dist/cli, ../../templates = templates/
  // In dev (src/cli/utils/): ../../templates = src/templates/ (doesn't exist) → fallback used
  const templatePath = join(__dirname, '../../templates/claude-snippet.md')
  if (existsSync(templatePath)) {
    return readFileSync(templatePath, 'utf-8')
  }
  return `${SENTINEL_START}
## Engram — Convention Memory Layer

You have access to an Engram MCP server at http://localhost:7337/mcp. Persistent memory across sessions — survives compaction, restarts, and agent handoffs.

**Session start (required):**
1. \`session_start()\` — returns your previous task + relevant memories
2. Check \`memories.critical\` and \`memories.antipatterns\` before doing anything

**The goal:** Every session makes the next session smarter.
${SENTINEL_END}
`
}

export function injectClaudeMd(projectDir: string): 'created' | 'updated' | 'unchanged' {
  const claudeMdPath = join(projectDir, 'CLAUDE.md')
  const snippet = getSnippet()

  if (!existsSync(claudeMdPath)) {
    writeFileSync(claudeMdPath, snippet, 'utf-8')
    return 'created'
  }

  const content = readFileSync(claudeMdPath, 'utf-8')

  if (content.includes(SENTINEL_START) && content.includes(SENTINEL_END)) {
    const startIdx = content.indexOf(SENTINEL_START)
    const endIdx = content.indexOf(SENTINEL_END)
    const existingBlock = content.slice(startIdx, endIdx + SENTINEL_END.length)

    if (existingBlock.trim() === snippet.trim()) {
      return 'unchanged'
    }

    const before = content.slice(0, startIdx)
    const after = content.slice(endIdx + SENTINEL_END.length)
    writeFileSync(claudeMdPath, before + snippet + after, 'utf-8')
    return 'updated'
  }

  // No sentinels found — append snippet
  writeFileSync(claudeMdPath, content + '\n\n' + snippet, 'utf-8')
  return 'updated'
}
