import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import Database from 'better-sqlite3'
import { handleSessionStart, handleUpdateTask } from './handlers/session.js'
import { handleRemember, handleRecall, handleInvalidate } from './handlers/memory.js'
import { MEMORY_TYPES, MEMORY_SCOPES } from '../db/memories.js'
import { logger } from '../logger.js'

export function setupTools(
  server: McpServer,
  db: Database.Database,
  globalDb?: Database.Database | null,
): void {
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
        const result = await handleSessionStart(db, params, globalDb ?? null)
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

  server.tool(
    'remember',
    'Store a piece of project knowledge for future recall',
    {
      content: z.string().describe('The knowledge to store'),
      type: z.enum(MEMORY_TYPES).describe('Category of knowledge'),
      scope: z.enum(MEMORY_SCOPES).describe('Area of the codebase this applies to'),
      source: z.enum(['agent', 'manual']).optional().describe('Who created this memory'),
      global: z.boolean().optional().describe('Store in global DB (cross-project)'),
    },
    async (params) => {
      try {
        const result = await handleRemember(db, globalDb ?? null, params)
        return { content: [{ type: 'text', text: JSON.stringify(result) }] }
      } catch (err) {
        logger.error('remember failed', err)
        throw err
      }
    },
  )

  server.tool(
    'recall',
    'Retrieve stored project knowledge, ranked by relevance',
    {
      scopes: z
        .array(z.enum(MEMORY_SCOPES))
        .optional()
        .describe('Filter by scope(s)'),
      types: z
        .array(z.enum(MEMORY_TYPES))
        .optional()
        .describe('Filter by memory type(s)'),
      query: z.string().optional().describe('Full-text search query'),
      include_global: z.boolean().optional().describe('Include global memories'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Max memories to return (default 15)'),
    },
    async (params) => {
      try {
        const result = await handleRecall(db, globalDb ?? null, params)
        return { content: [{ type: 'text', text: JSON.stringify(result) }] }
      } catch (err) {
        logger.error('recall failed', err)
        throw err
      }
    },
  )

  server.tool(
    'invalidate',
    'Mark a memory as no longer valid',
    {
      id: z.string().describe('Memory ID to invalidate'),
      reason: z.string().optional().describe('Why this memory is no longer valid'),
    },
    async (params) => {
      try {
        const result = await handleInvalidate(db, params)
        return { content: [{ type: 'text', text: JSON.stringify(result) }] }
      } catch (err) {
        logger.error('invalidate failed', err)
        throw err
      }
    },
  )
}
