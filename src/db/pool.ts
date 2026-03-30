import Database from 'better-sqlite3'
import { openProjectDb } from './connection.js'

export class DbPool {
  private dbs = new Map<string, Database.Database>()
  readonly defaultWorktree: string | null

  constructor(defaultWorktree: string | null = null) {
    this.defaultWorktree = defaultWorktree
    if (defaultWorktree) this.get(defaultWorktree)
  }

  get(projectDir: string): Database.Database {
    if (!this.dbs.has(projectDir)) {
      this.dbs.set(projectDir, openProjectDb(projectDir))
    }
    return this.dbs.get(projectDir)!
  }

  /** Inject an already-open DB for a path. Useful for testing. */
  set(projectDir: string, db: Database.Database): void {
    this.dbs.set(projectDir, db)
  }

  resolve(worktree?: string): Database.Database {
    const dir = worktree ?? this.defaultWorktree
    if (!dir) throw new Error('worktree required — no default configured')
    return this.get(dir)
  }

  getAllDbs(): Database.Database[] {
    return [...this.dbs.values()]
  }

  closeAll(): void {
    for (const db of this.dbs.values()) db.close()
    this.dbs.clear()
  }
}
