import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { loadConfig } from '../../config.js'

// loadConfig(projectDir) reads:
//   ~/.engram/config.json  (global)
//   <projectDir>/.engram/config.json  (project)
// We only control projectDir, so we test via that path.
// Global config is whatever exists on the machine — we don't touch it.

describe('loadConfig deep merge', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), `engram-config-test-${Date.now()}`)
    mkdirSync(join(tmpDir, '.engram'), { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  function writeProjectConfig(cfg: object): void {
    writeFileSync(join(tmpDir, '.engram', 'config.json'), JSON.stringify(cfg))
  }

  it('returns full DEFAULTS when no config files exist', () => {
    const config = loadConfig(join(tmpdir(), 'nonexistent-dir-xyz'))
    expect(config.port).toBe(7337)
    expect(config.observer.port).toBe(7338)
    expect(config.observer.ollamaUrl).toBe('http://localhost:11434')
    expect(config.observer.batchSize).toBe(10)
    expect(config.semanticRetrieval.embeddingModel).toBe('nomic-embed-text')
  })

  it('partial observer config preserves unset nested fields', () => {
    // Only enable the observer — all other observer fields should remain at defaults
    writeProjectConfig({ observer: { enabled: true } })
    const config = loadConfig(tmpDir)
    expect(config.observer.enabled).toBe(true)
    expect(config.observer.port).toBe(7338)
    expect(config.observer.ollamaUrl).toBe('http://localhost:11434')
    expect(config.observer.batchSize).toBe(10)
    expect(config.observer.flushIntervalMs).toBe(30000)
    expect(config.observer.model).toBe('ollama')
    expect(config.observer.ollamaModel).toBe('llama3.2')
  })

  it('partial semanticRetrieval config preserves unset nested fields', () => {
    writeProjectConfig({ semanticRetrieval: { enabled: true } })
    const config = loadConfig(tmpDir)
    expect(config.semanticRetrieval.enabled).toBe(true)
    expect(config.semanticRetrieval.ollamaUrl).toBe('http://localhost:11434')
    expect(config.semanticRetrieval.embeddingModel).toBe('nomic-embed-text')
    expect(config.semanticRetrieval.contradictionThreshold).toBe(0.85)
  })

  it('scalar override in project config takes effect', () => {
    writeProjectConfig({ port: 8080, domain: 'legal' })
    const config = loadConfig(tmpDir)
    expect(config.port).toBe(8080)
    expect(config.domain).toBe('legal')
  })

  it('nested field override does not bleed into sibling fields', () => {
    writeProjectConfig({ observer: { batchSize: 5, port: 7340 } })
    const config = loadConfig(tmpDir)
    expect(config.observer.batchSize).toBe(5)
    expect(config.observer.port).toBe(7340)
    // Sibling fields must still have defaults
    expect(config.observer.enabled).toBe(false)
    expect(config.observer.ollamaUrl).toBe('http://localhost:11434')
  })

  it('combined scalar + nested override works', () => {
    writeProjectConfig({
      port: 9000,
      observer: { enabled: true, batchSize: 20 },
      semanticRetrieval: { enabled: true },
    })
    const config = loadConfig(tmpDir)
    expect(config.port).toBe(9000)
    expect(config.observer.enabled).toBe(true)
    expect(config.observer.batchSize).toBe(20)
    expect(config.observer.port).toBe(7338) // default preserved
    expect(config.semanticRetrieval.enabled).toBe(true)
    expect(config.semanticRetrieval.embeddingModel).toBe('nomic-embed-text') // default preserved
  })

  it('invalid json in config file is silently ignored', () => {
    writeFileSync(join(tmpDir, '.engram', 'config.json'), '{ not valid json }')
    const config = loadConfig(tmpDir)
    expect(config.port).toBe(7337) // falls back to DEFAULTS
  })
})
