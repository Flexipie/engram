import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { handleSessionStart, handleUpdateTask } from './handlers/session.js'
import { handleRemember, handleRecall, handleInvalidate } from './handlers/memory.js'
import { handleCheckError, handleRecordError } from './handlers/error.js'
import { handleCheckConventions } from './handlers/enforce.js'
import { handleGetWorktreeStatus } from './handlers/worktree.js'
import { MEMORY_TYPES, MEMORY_SCOPES } from '../db/memories.js'
import { loadConfig } from '../config.js'
import { logger } from '../logger.js'
import { DbPool } from '../db/pool.js'
import type Database from 'better-sqlite3'

export function setupTools(
  server: McpServer,
  pool: DbPool,
  globalDb?: Database.Database | null,
): void {
  const enforcementConfig = loadConfig(process.cwd())

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
        const db = pool.resolve((params as { worktree?: string }).worktree)
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
        .describe('Discovered constraints (\"don\'t touch X\")'),
      decisions: z
        .array(z.string())
        .optional()
        .describe('Decisions made with rationale'),
    },
    async (params) => {
      try {
        const db = pool.resolve((params as { worktree?: string }).worktree)
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
      worktree: z
        .string()
        .optional()
        .describe('Absolute path to worktree (defaults to cwd)'),
      content: z.string().describe('The knowledge to store'),
      type: z.enum(MEMORY_TYPES).describe('Category of knowledge'),
      scope: z.enum(MEMORY_SCOPES).describe('Area of the codebase this applies to'),
      source: z.enum(['agent', 'manual']).optional().describe('Who created this memory'),
      global: z.boolean().optional().describe('Store in global DB (cross-project)'),
    },
    async (params) => {
      try {
        const db = pool.resolve((params as { worktree?: string }).worktree)
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
      worktree: z
        .string()
        .optional()
        .describe('Absolute path to worktree (defaults to cwd)'),
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
        const db = pool.resolve((params as { worktree?: string }).worktree)
        const result = await handleRecall(db, globalDb ?? null, params)
        return { content: [{ type: 'text', text: JSON.stringify(result) }] }
      } catch (err) {
        logger.error('recall failed', err)
        throw err
      }
    },
  )

  server.tool(
    'check_error',
    'Look up a known error by signature before diagnosing — returns fix immediately if found',
    {
      worktree: z
        .string()
        .optional()
        .describe('Absolute path to worktree (defaults to cwd)'),
      error_raw: z.string().describe('The full error output'),
      scope: z.enum(MEMORY_SCOPES).optional().describe('Scope hint (auto-detected if omitted)'),
    },
    async (params) => {
      try {
        const db = pool.resolve((params as { worktree?: string }).worktree)
        const result = await handleCheckError(db, params)
        return { content: [{ type: 'text', text: JSON.stringify(result) }] }
      } catch (err) {
        logger.error('check_error failed', err)
        throw err
      }
    },
  )

  server.tool(
    'record_error',
    'Persist an error pattern with its cause and fix for future lookup',
    {
      worktree: z
        .string()
        .optional()
        .describe('Absolute path to worktree (defaults to cwd)'),
      error_raw: z.string().describe('The full error output'),
      cause: z.string().optional().describe('What caused the error'),
      fix: z.string().optional().describe('What resolved it'),
      scope: z.enum(MEMORY_SCOPES).optional().describe('Scope (auto-detected if omitted)'),
    },
    async (params) => {
      try {
        const db = pool.resolve((params as { worktree?: string }).worktree)
        const result = await handleRecordError(db, params)
        return { content: [{ type: 'text', text: JSON.stringify(result) }] }
      } catch (err) {
        logger.error('record_error failed', err)
        throw err
      }
    },
  )

  server.tool(
    'invalidate',
    'Mark a memory as no longer valid',
    {
      worktree: z
        .string()
        .optional()
        .describe('Absolute path to worktree (defaults to cwd)'),
      id: z.string().describe('Memory ID to invalidate'),
      reason: z.string().optional().describe('Why this memory is no longer valid'),
    },
    async (params) => {
      try {
        const db = pool.resolve((params as { worktree?: string }).worktree)
        const result = await handleInvalidate(db, params)
        return { content: [{ type: 'text', text: JSON.stringify(result) }] }
      } catch (err) {
        logger.error('invalidate failed', err)
        throw err
      }
    },
  )

  server.tool(
    'get_worktree_status',
    'Get all active worktrees and detect file conflicts — use mid-session to check if other agents are touching files you plan to edit',
    {
      worktree: z.string().optional().describe('Absolute path to current worktree (defaults to cwd)'),
    },
    async (params) => {
      try {
        const db = pool.resolve((params as { worktree?: string }).worktree)
        const result = await handleGetWorktreeStatus(db, params)
        return { content: [{ type: 'text', text: JSON.stringify(result) }] }
      } catch (err) {
        logger.error('get_worktree_status failed', err)
        throw err
      }
    },
  )

  server.tool(
    'check_conventions',
    'Check stored conventions and anti-patterns for a file path before writing — returns violations (blocking) and warnings (informational)',
    {
      worktree: z
        .string()
        .optional()
        .describe('Absolute path to worktree (defaults to cwd)'),
      file_path: z.string().describe('Path of the file about to be written'),
      content: z.string().optional().describe('File content (reserved — not used in Phase 5)'),
      scope: z.enum(MEMORY_SCOPES).optional().describe('Scope override (auto-detected from path if omitted)'),
    },
    async (params) => {
      try {
        const db = pool.resolve((params as { worktree?: string }).worktree)
        const result = await handleCheckConventions(db, enforcementConfig, params)
        return { content: [{ type: 'text', text: JSON.stringify(result) }] }
      } catch (err) {
        logger.error('check_conventions failed', err)
        throw err
      }
    },
  )
}
