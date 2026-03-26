import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import Database from 'better-sqlite3'
import { handleSessionStart, handleUpdateTask } from './handlers/session.js'
import { logger } from '../logger.js'

export function setupTools(server: McpServer, db: Database.Database): void {
  server.tool(
    'session_start',
    'Start or resume a session, loading task state and relevant memories',
    {
      worktree: z
        .string()
        .optional()
        .describe('Absolute path to worktree (defaults to cwd)'),
      context_hint: z
        .string()
        .optional()
        .describe('Hint about what you\'re working on'),
    },
    async (params) => {
      try {
        const result = await handleSessionStart(db, params)
        return { content: [{ type: 'text', text: JSON.stringify(result) }] }
      } catch (err) {
        logger.error('session_start failed', err)
        throw err
      }
    },
  )

  server.tool(
    'update_task',
    'Create or update the active task for the current worktree. Partial updates — only provided fields are changed.',
    {
      worktree: z
        .string()
        .optional()
        .describe('Absolute path to worktree (defaults to cwd)'),
      title: z.string().optional().describe('Short human-readable task label'),
      goal: z.string().optional().describe('What this task is trying to accomplish'),
      summary: z.string().optional().describe('Running plain-english summary of progress'),
      completed: z.array(z.string()).optional().describe('List of completed work items'),
      in_progress: z.string().optional().describe('What is actively being worked on right now'),
      next_steps: z.array(z.string()).optional().describe('Upcoming steps'),
      key_files: z.array(z.string()).optional().describe('File paths relevant to this task'),
      constraints: z
        .array(z.string())
        .optional()
        .describe('Discovered constraints ("don\'t touch X")'),
      decisions: z
        .array(z.string())
        .optional()
        .describe('Decisions made with rationale'),
    },
    async (params) => {
      try {
        const result = await handleUpdateTask(db, params)
        return { content: [{ type: 'text', text: JSON.stringify(result) }] }
      } catch (err) {
        logger.error('update_task failed', err)
        throw err
      }
    },
  )
}
