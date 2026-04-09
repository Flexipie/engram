import express from 'express'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { writeFileSync, rmSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { openGlobalDb } from './db/global.js'
import { loadConfig } from './config.js'
import { logger } from './logger.js'
import { setupTools } from './mcp/tools.js'
import { createHealthHandler } from './http/health.js'
import { createHeartbeatHandler } from './http/heartbeat.js'
import { createSnapshotHandler } from './http/snapshot.js'
import { createEnforceHandler, type EnforcementStats } from './http/enforce.js'
import { DbPool } from './db/pool.js'
import { setActiveProfile } from './domain/active-profile.js'
import { createV1Router } from './http/api/v1/router.js'
import { openApiSpec } from './http/api/openapi.js'
import { OllamaEmbeddingService, NoopEmbeddingService } from './retrieval/embeddings.js'

const isGlobal = process.env.ENGRAM_GLOBAL === 'true'
const projectDir = isGlobal ? null : (process.env.ENGRAM_PROJECT_DIR ?? process.cwd())
const config = loadConfig(projectDir ?? undefined)

// Activate domain profile from config
try {
  setActiveProfile(config.domain)
} catch {
  logger.warn(`Unknown domain profile "${config.domain}", falling back to "software"`)
}
const port = Number(process.env.ENGRAM_PORT ?? config.port)

// DB pool: global mode has no default (resolved per request); project mode pre-opens the project DB
const pool = new DbPool(projectDir)

// Global DB: always open in global mode; conditional in project mode
const globalDb = (isGlobal || config.alwaysIncludeGlobal) ? openGlobalDb() : null

// Determine base dir for PID/running files
const baseDir = isGlobal ? join(homedir(), '.engram') : join(projectDir!, '.engram')
if (!existsSync(baseDir)) {
  mkdirSync(baseDir, { recursive: true })
}

const pidFile = join(baseDir, 'engram.pid')
const runningFile = join(baseDir, 'running.json')

writeFileSync(pidFile, String(process.pid), 'utf-8')

// In-memory enforcement stats (reset on restart)
export const enforcementStats: EnforcementStats = { checks: 0, violations: 0, warnings: 0 }

// Embedding service — disabled by default, enabled via config
const embeddingService = config.semanticRetrieval.enabled
  ? new OllamaEmbeddingService(config.semanticRetrieval.ollamaUrl, config.semanticRetrieval.embeddingModel)
  : new NoopEmbeddingService()

const mode = isGlobal ? 'global' : 'project'

// Express app
const app = express()
app.use(express.json())

// Health endpoint
app.get('/health', createHealthHandler(pool, enforcementStats, mode))

// Heartbeat endpoint
app.post('/heartbeat', createHeartbeatHandler(pool))

// Snapshot endpoint
app.post('/snapshot', createSnapshotHandler(pool))

// Convention enforcement endpoint
app.post('/enforce', createEnforceHandler(pool, config, enforcementStats))

// REST API v1
app.use('/v1', createV1Router(pool, globalDb, config, enforcementStats, embeddingService))

// OpenAPI spec
app.get('/openapi.json', (_req, res) => res.json(openApiSpec))

// MCP streamable HTTP transport
app.post('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  const server = new McpServer({ name: 'engram', version: '0.1.0' })
  setupTools(server, pool, globalDb, embeddingService)
  await server.connect(transport)
  await transport.handleRequest(req, res, req.body)
})

// Start server
const httpServer = app.listen(port, () => {
  const runningInfo = {
    pid: process.pid,
    port,
    started_at: new Date().toISOString(),
    mode,
    project_dir: projectDir,
  }
  writeFileSync(runningFile, JSON.stringify(runningInfo, null, 2), 'utf-8')
  logger.info(`Engram server listening on port ${port}`, { pid: process.pid, port, mode })
})

// Graceful shutdown
function shutdown(): void {
  logger.info('Shutting down...')
  httpServer.close(() => {
    pool.closeAll()
    if (globalDb) globalDb.close()
    if (existsSync(pidFile)) rmSync(pidFile)
    if (existsSync(runningFile)) rmSync(runningFile)
    logger.info('Shutdown complete')
    process.exit(0)
  })
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

export { app }
