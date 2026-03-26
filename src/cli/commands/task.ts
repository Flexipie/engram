import { join } from 'path'
import chalk from 'chalk'
import { openProjectDb } from '../../db/connection.js'
import { getActiveTask } from '../../db/tasks.js'
import { getActiveWorktrees } from '../../db/worktrees.js'

export async function runTask(
  projectDir: string = process.cwd(),
  showAll = false,
): Promise<void> {
  const db = openProjectDb(projectDir)

  try {
    if (showAll) {
      const worktrees = getActiveWorktrees(db)
      if (worktrees.length === 0) {
        console.log(chalk.yellow('No active worktrees.'))
        return
      }

      console.log(chalk.bold('\nActive worktrees:\n'))
      for (const wt of worktrees) {
        console.log(chalk.cyan(wt.worktree))
        if (wt.task_id) {
          const taskResult = getActiveTask(db, wt.worktree)
          if (taskResult) {
            console.log(`  Task:   ${chalk.white(taskResult.task.title)}`)
            console.log(`  Goal:   ${chalk.gray(taskResult.task.goal)}`)
            if (taskResult.state?.summary) {
              console.log(`  Summary: ${chalk.gray(taskResult.state.summary)}`)
            }
          }
        } else {
          console.log(`  ${chalk.gray('No active task')}`)
        }
        const lastHeartbeat = new Date(wt.last_heartbeat)
        const agoSec = Math.floor((Date.now() - lastHeartbeat.getTime()) / 1000)
        console.log(`  Last heartbeat: ${chalk.gray(`${agoSec}s ago`)}`)
        console.log()
      }
      return
    }

    // Show task for current worktree
    const worktree = process.cwd()
    const taskResult = getActiveTask(db, worktree)

    if (!taskResult) {
      console.log(chalk.yellow(`No active task for worktree: ${worktree}`))
      return
    }

    const { task, state } = taskResult

    console.log(chalk.bold('\nActive task:\n'))
    console.log(`  ID:      ${chalk.gray(task.id)}`)
    console.log(`  Title:   ${chalk.white(task.title)}`)
    console.log(`  Goal:    ${chalk.cyan(task.goal)}`)
    console.log(`  Status:  ${chalk.green(task.status)}`)
    console.log(`  Started: ${chalk.gray(task.started_at)}`)
    console.log(`  Updated: ${chalk.gray(task.updated_at)}`)

    if (state.summary) {
      console.log(`\n  Summary:\n  ${chalk.gray(state.summary)}`)
    }

    if (state.in_progress) {
      console.log(`\n  In progress:\n  ${chalk.yellow(state.in_progress)}`)
    }

    if (state.completed.length > 0) {
      console.log('\n  Completed:')
      for (const item of state.completed) {
        console.log(`    ${chalk.green('✓')} ${item}`)
      }
    }

    if (state.next_steps.length > 0) {
      console.log('\n  Next steps:')
      for (const step of state.next_steps) {
        console.log(`    ${chalk.blue('→')} ${step}`)
      }
    }

    if (state.key_files.length > 0) {
      console.log('\n  Key files:')
      for (const file of state.key_files) {
        console.log(`    ${chalk.gray(file)}`)
      }
    }

    console.log()
  } finally {
    db.close()
  }
}
