import { execSync } from 'child_process'
import { dirname, isAbsolute, join } from 'path'

const cache = new Map<string, string>()

/**
 * Resolve a worktree path to the shared git project root.
 * All worktrees from the same repo share one git-common-dir, so we use the
 * repo root as the DB key — every branch/worktree from the same repo
 * shares the same project.db.
 *
 * Handles three cases:
 *   ".git"              → relative, worktreePath IS the main checkout
 *   "/abs/path/.git"    → regular checkout; dirname is the project root
 *   "/abs/path/bare"    → bare repo; use the path directly as the key
 *
 * Falls back to worktreePath when git is unavailable or dir is not a repo.
 */
export function resolveProjectRoot(worktreePath: string): string {
  if (cache.has(worktreePath)) return cache.get(worktreePath)!

  try {
    const raw = execSync(`git -C "${worktreePath}" rev-parse --git-common-dir`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 2000,
    }).trim()

    const absCommon = isAbsolute(raw) ? raw : join(worktreePath, raw)

    let root: string
    if (raw === '.git') {
      // We are in the main checkout
      root = worktreePath
    } else if (raw.endsWith('/.git') || raw === '.git') {
      // Regular checkout: common-dir is the .git dir, parent is the root
      root = dirname(absCommon)
    } else {
      // Bare repo: the common-dir path itself is the canonical project key
      root = absCommon
    }

    cache.set(worktreePath, root)
    return root
  } catch {
    cache.set(worktreePath, worktreePath)
    return worktreePath
  }
}
