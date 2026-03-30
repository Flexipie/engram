import chalk from 'chalk'
import { injectClaudeMd } from '../utils/inject-claude-md.js'

export async function runUpdateClaudeMd(projectDir: string = process.cwd()): Promise<void> {
  const result = injectClaudeMd(projectDir)

  if (result === 'created') {
    console.log(chalk.green('Created CLAUDE.md with Engram snippet'))
  } else if (result === 'updated') {
    console.log(chalk.green('Updated Engram snippet in CLAUDE.md'))
  } else {
    console.log(chalk.gray('CLAUDE.md is already up to date'))
  }
}
