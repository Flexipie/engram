import chalk from 'chalk'
import { openProjectDb } from '../../db/connection.js'
import { listErrorPatterns, type ErrorPattern } from '../../db/errors.js'

function truncate(str: string, max = 60): string {
  return str.length > max ? str.slice(0, max - 3) + '...' : str
}

function formatDate(iso: string): string {
  return iso.slice(0, 10)
}

export async function runErrors(opts: {
  scope?: string
  json?: boolean
  verbose?: boolean
  projectDir?: string
}): Promise<void> {
  const projectDir = opts.projectDir ?? process.cwd()
  const db = openProjectDb(projectDir)

  try {
    const patterns = listErrorPatterns(db, { scope: opts.scope })

    if (opts.json) {
      console.log(JSON.stringify(patterns, null, 2))
      return
    }

    if (patterns.length === 0) {
      console.log(chalk.gray('No error patterns found.'))
      return
    }

    // Group by scope
    const byScope = new Map<string, ErrorPattern[]>()
    for (const p of patterns) {
      if (!byScope.has(p.scope)) byScope.set(p.scope, [])
      byScope.get(p.scope)!.push(p)
    }

    console.log(chalk.bold(`\nError Patterns (${patterns.length} total)\n`))

    for (const [scope, items] of byScope.entries()) {
      console.log(`${chalk.cyan.bold(scope)}  (${items.length})`)
      for (const item of items) {
        const sig = chalk.dim(`[${item.signature.slice(0, 8)}]`)
        const recur = chalk.yellow(`${item.recurrence}x`)
        const date = chalk.dim(formatDate(item.last_seen))
        console.log(`  ${sig}  ${truncate(item.error_raw, 55)}   ${recur}  ${date}`)
        if (item.fix) {
          console.log(`           ${chalk.green('fix:')} ${item.fix}`)
        }
        if (opts.verbose) {
          if (item.cause) {
            console.log(`           ${chalk.blue('cause:')} ${item.cause}`)
          }
          console.log(`           ${chalk.dim('normalized:')} ${truncate(item.error_normalized, 70)}`)
        }
      }
      console.log()
    }
  } finally {
    db.close()
  }
}
