import { describe, it, expect, afterEach } from 'vitest'
import { mkdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { DbPool } from '../../db/pool.js'

function makeTempDir(): string {
  const dir = join(tmpdir(), `engram-pool-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('DbPool', () => {
  const tmpDirs: string[] = []

  function tempDir(): string {
    const d = makeTempDir()
    tmpDirs.push(d)
    return d
  }

  afterEach(() => {
    for (const d of tmpDirs) {
      if (existsSync(d)) rmSync(d, { recursive: true })
    }
    tmpDirs.length = 0
  })

  it('resolve() throws when no default worktree and none given', () => {
    const pool = new DbPool(null)
    expect(() => pool.resolve()).toThrow('worktree required')
  })

  it('new DbPool(path) pre-opens DB and resolve() returns it', () => {
    const dir = tempDir()
    const pool = new DbPool(dir)
    const db = pool.resolve()
    expect(db).toBeDefined()
    expect(db.open).toBe(true)
    pool.closeAll()
  })

  it('pool.get(path) called twice returns same instance', () => {
    const pool = new DbPool(null)
    const dir = tempDir()
    const db1 = pool.get(dir)
    const db2 = pool.get(dir)
    expect(db1).toBe(db2)
    pool.closeAll()
  })

  it('getAllDbs() returns all open DBs', () => {
    const pool = new DbPool(null)
    const dir1 = tempDir()
    const dir2 = tempDir()
    pool.get(dir1)
    pool.get(dir2)
    expect(pool.getAllDbs().length).toBe(2)
    pool.closeAll()
  })

  it('resolve(worktree) returns correct DB for that worktree', () => {
    const pool = new DbPool(null)
    const dir1 = tempDir()
    const dir2 = tempDir()
    const db1 = pool.get(dir1)
    pool.get(dir2)
    expect(pool.resolve(dir1)).toBe(db1)
    pool.closeAll()
  })

  it('resolve() uses default worktree when no arg given', () => {
    const dir = tempDir()
    const pool = new DbPool(dir)
    const db = pool.resolve()
    expect(db).toBe(pool.get(dir))
    pool.closeAll()
  })

  it('closeAll() closes all connections', () => {
    const pool = new DbPool(null)
    const dir = tempDir()
    const db = pool.get(dir)
    pool.closeAll()
    expect(db.open).toBe(false)
  })

  it('getAllDbs() returns empty array for empty pool', () => {
    const pool = new DbPool(null)
    expect(pool.getAllDbs()).toEqual([])
  })
})
