import express from 'express'
import type { DbPool } from '../db/pool.js'
import type Database from 'better-sqlite3'
import type { EngramConfig } from '../config.js'
import { createV1Router } from '../http/api/v1/router.js'
import { openApiSpec } from '../http/api/openapi.js'

const DEFAULT_CONFIG: EngramConfig = {
  port: 7337,
  maxMemories: 15,
  globalMemoryCap: 5,
  warnThreshold: 0.6,
  blockThreshold: 0.8,
  alwaysIncludeGlobal: false,
  minRecallConfidence: 0.4,
  domain: 'software',
  apiKeyRequired: false,
  apiKeys: [],
  observer: {
    enabled: false,
    model: 'ollama',
    ollamaUrl: 'http://localhost:11434',
    ollamaModel: 'llama3.2',
    batchSize: 10,
    flushIntervalMs: 30000,
    port: 7338,
  },
}

export function createTestApp(
  pool: DbPool,
  globalDb: Database.Database | null,
  configOverride: Partial<EngramConfig> = {},
): express.Express {
  const config: EngramConfig = { ...DEFAULT_CONFIG, ...configOverride }

  const app = express()
  app.use(express.json())
  app.use('/v1', createV1Router(pool, globalDb, config))
  app.get('/openapi.json', (_req, res) => res.json(openApiSpec))

  return app
}
