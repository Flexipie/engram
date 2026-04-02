import { loadConfig } from '../config.js'
import { createObserverApp } from './server.js'
import { OllamaExtractor } from './extractors/ollama.js'
import { HaikuExtractor } from './extractors/haiku.js'
import { RestApiWriter } from './writer.js'
import { logger } from '../logger.js'

const config = loadConfig(process.env['ENGRAM_PROJECT_DIR'])

if (!config.observer.enabled) {
  logger.warn('Observer: not enabled in config. Set observer.enabled = true to start.')
  process.exit(0)
}

const engramBaseUrl = `http://localhost:${config.port}`
const worktree = process.env['ENGRAM_PROJECT_DIR'] ?? process.cwd()
const apiKey = config.apiKeys[0] // use first key if any

const writer = new RestApiWriter(engramBaseUrl, worktree, apiKey)

let extractor
if (config.observer.model === 'haiku') {
  const apiKeyHaiku = config.observer.haikuApiKey
  if (!apiKeyHaiku) {
    logger.error('Observer: haiku model requires observer.haikuApiKey in config')
    process.exit(1)
  }
  extractor = new HaikuExtractor({ apiKey: apiKeyHaiku })
} else {
  extractor = new OllamaExtractor({
    url: config.observer.ollamaUrl,
    model: config.observer.ollamaModel,
  })
}

const app = createObserverApp({
  extractor,
  writer,
  batchSize: config.observer.batchSize,
  flushIntervalMs: config.observer.flushIntervalMs,
  worktree,
})

const port = config.observer.port
app.listen(port, '127.0.0.1', () => {
  logger.info(`Observer listening on http://127.0.0.1:${port}`)
})

process.on('SIGTERM', () => {
  logger.info('Observer: received SIGTERM, shutting down')
  process.exit(0)
})

process.on('SIGINT', () => {
  logger.info('Observer: received SIGINT, shutting down')
  process.exit(0)
})
