import chalk from 'chalk'
import { openProjectDb } from '../../db/connection.js'
import { queryMemories, type Memory, type MemoryScope, type MemoryType } from '../../db/memories.js'

function truncate(str: string, max = 60): string {
  return str.length > max ? str.slice(0, max - 3) + '...' : str
}

function formatConfidence(c: number): string {
  const str = c.toFixed(2)
  if (c >= 0.7) return chalk.green(str)
  if (c >= 0.4) return chalk.yellow(str)
  return chalk.red(str)
}

export async function runMemories(opts: {
  scope?: string
  type?: string
  json?: boolean
  projectDir?: string
}): Promise<void> {
  const projectDir = opts.projectDir ?? process.cwd()
  const db = openProjectDb(projectDir)

  try {
    const memories = queryMemories(db, {
      scopes: opts.scope ? [opts.scope] : undefined,
      types: opts.type ? [opts.type as MemoryType] : undefined,
      excludeInvalidated: true,
    })

    if (opts.json) {
      console.log(JSON.stringify(memories, null, 2))
      return
    }

    if (memories.length === 0) {
      console.log(chalk.gray('No memories found.'))
      return
    }

    if (opts.scope) {
      // Drill-in mode: show full content for one scope
      printScopeDetail(memories, opts.scope)
    } else {
      // Tree view
      printTree(memories)
    }
  } finally {
    db.close()
  }
}

function printTree(memories: Memory[]): void {
  // Group by scope then type
  const byScope = new Map<string, Map<string, Memory[]>>()

  for (const m of memories) {
    if (!byScope.has(m.scope)) byScope.set(m.scope, new Map())
    const byType = byScope.get(m.scope)!
    if (!byType.has(m.type)) byType.set(m.type, [])
    byType.get(m.type)!.push(m)
  }

  const uniqueScopes = [...byScope.keys()]
  console.log(chalk.bold(`\nMemories (${memories.length} total, ${uniqueScopes.length} scopes)\n`))

  const scopeEntries = [...byScope.entries()]
  scopeEntries.forEach(([scope, byType], scopeIdx) => {
    const isLastScope = scopeIdx === scopeEntries.length - 1
    const scopePrefix = isLastScope ? '└──' : '├──'
    const scopeCount = [...byType.values()].reduce((sum, arr) => sum + arr.length, 0)
    console.log(`${scopePrefix} ${chalk.cyan.bold(scope)}  (${scopeCount})`)

    const typeEntries = [...byType.entries()]
    typeEntries.forEach(([type, mems], typeIdx) => {
      const isLastType = typeIdx === typeEntries.length - 1
      const typeIndent = isLastScope ? '    ' : '│   '
      const typePrefix = isLastType ? '└──' : '├──'
      console.log(`${typeIndent}${typePrefix} ${chalk.yellow(type)} (${mems.length})`)

      const memIndent = typeIndent + (isLastType ? '    ' : '│   ')
      mems.forEach((m) => {
        const conf = formatConfidence(m.confidence)
        const src = chalk.gray(m.source)
        console.log(`${memIndent}  • ${truncate(m.content, 55)}  [${conf}] ${src}`)
      })
    })

    if (!isLastScope) console.log('│')
  })
  console.log()
}

function printScopeDetail(memories: Memory[], scope: string): void {
  const byType = new Map<string, Memory[]>()
  for (const m of memories) {
    if (!byType.has(m.type)) byType.set(m.type, [])
    byType.get(m.type)!.push(m)
  }

  console.log(chalk.bold(`\nMemories: ${chalk.cyan(scope)}  (${memories.length})\n`))

  for (const [type, mems] of byType.entries()) {
    console.log(chalk.yellow.bold(type))
    for (const m of mems) {
      console.log(`  ${chalk.dim('[' + m.id.slice(0, 8) + ']')} ${m.content}`)
      const validated = m.last_validated ? m.last_validated.slice(0, 10) : 'never'
      console.log(
        `           confidence: ${formatConfidence(m.confidence)} | source: ${chalk.gray(m.source)} | validated: ${chalk.dim(validated)}`,
      )
    }
    console.log()
  }
}
