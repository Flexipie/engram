import express from 'express'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { writeFileSync, rmSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { openProjectDb } from './db/connection.js'
import { openGlobalDb } from './db/global.js'
import { loadConfig } from './config.js'
import { logger } from './logger.js'
import { setupTools } from './mcp/tools.js'
import { healthHandler } from './http/health.js'
import { createHeartbeatHandler } from './http/heartbeat.js'
import { createSnapshotHandler } from './http/snapshot.js'

const projectDir = process.env.ENGRAM_PROJECT_DIR ?? process.cwd()
const config = loadConfig(projectDir)
const port = Number(process.env.ENGRAM_PORT ?? config.port)

// Open DB
const db = openProjectDb(projectDir)
const globalDb = config.alwaysIncludeGlobal ? openGlobalDb() : null

// Write PID and running info
const engramDir = join(projectDir, '.engram')
if (!existsSync(engramDir)) {
  mkdirSync(engramDir, { recursive: true })
}

const pidFile = join(engramDir, 'engram.pid')
const runningFile = join(engramDir, 'running.json')

writeFileSync(pidFile, String(process.pid), 'utf-8')

// Express app
const app = express()
app.use(express.json())

// Health endpoint
app.get('/health', healthHandler)

// Heartbeat endpoint
app.post('/heartbeat', createHeartbeatHandler(db))

// Snapshot endpoint
app.post('/snapshot', createSnapshotHandler(db))

// MCP SSE transport — map of sessionId → transport
const transports = new Map<string, SSEServerTransport>()

app.get('/mcp', (req, res) => {
  const transport = new SSEServerTransport('/mcp/message', res)
  const server = new McpServer({ name: 'engram', version: '0.1.0' })
  setupTools(server, db, globalDb)
  void server.connect(transport)
  transports.set(transport.sessionId, transport)
  res.on('close', () => {
    transports.delete(transport.sessionId)
  })
})

app.post('/mcp/message', async (req, res) => {
  const sessionId = req.query['sessionId'] as string
  const transport = transports.get(sessionId)
  if (!transport) {
    res.status(404).json({ error: 'Session not found' })
    return
  }
  await transport.handlePostMessage(req, res)
})

// Start server
const httpServer = app.listen(port, () => {
  const runningInfo = {
    pid: process.pid,
    port,
    started_at: new Date().toISOString(),
  }
  writeFileSync(runningFile, JSON.stringify(runningInfo, null, 2), 'utf-8')
  logger.info(`Engram server listening on port ${port}`, { pid: process.pid, port })
})

// Graceful shutdown
function shutdown(): void {
  logger.info('Shutting down...')
  httpServer.close(() => {
    db.close()
    if (globalDb) globalDb.close()
    if (existsSync(pidFile)) rmSync(pidFile)
    if (existsSync(runningFile)) rmSync(runningFile)
    logger.info('Shutdown complete')
    process.exit(0)
  })
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

export { app, db }
