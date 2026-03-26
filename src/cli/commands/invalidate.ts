import { createInterface } from 'readline'
import chalk from 'chalk'
import { openProjectDb } from '../../db/connection.js'
import { getMemoryById, invalidateMemory } from '../../db/memories.js'

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

export async function runInvalidate(id: string, opts: { projectDir?: string }): Promise<void> {
  const projectDir = opts.projectDir ?? process.cwd()
  const db = openProjectDb(projectDir)

  try {
    const memory = getMemoryById(db, id)

    if (!memory) {
      console.error(chalk.red(`Memory not found: ${id}`))
      process.exit(1)
    }

    console.log(chalk.bold('\nMemory to invalidate:'))
    console.log(`  ID:         ${chalk.dim(memory.id)}`)
    console.log(`  Type:       ${chalk.yellow(memory.type)}`)
    console.log(`  Scope:      ${chalk.cyan(memory.scope)}`)
    console.log(`  Content:    ${memory.content}`)
    console.log(`  Confidence: ${memory.confidence.toFixed(2)}`)
    console.log()

    const reason = await prompt('Reason (optional, press Enter to skip): ')
    const confirm = await prompt(chalk.red('Invalidate this memory? [y/N] '))

    if (confirm.toLowerCase() !== 'y') {
      console.log(chalk.gray('Cancelled.'))
      return
    }

    const ok = invalidateMemory(db, id, reason.trim() || undefined)
    if (ok) {
      console.log(chalk.green('✓ Memory invalidated.'))
    } else {
      console.error(chalk.red('Failed to invalidate memory.'))
      process.exit(1)
    }
  } finally {
    db.close()
  }
}
