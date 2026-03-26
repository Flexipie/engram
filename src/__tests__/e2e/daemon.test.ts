import { describe, it } from 'vitest'

// E2E tests for daemon lifecycle (engram start / stop / status)
// These tests require spawning the built binary as a background process.
// They are marked as .todo because they:
//   1. Require `npm run build` to complete first
//   2. Involve port binding on 7337 which may conflict in CI
//   3. Require process management (spawn, wait for ready, terminate)
//
// Expected behaviors documented here for future implementation:

describe('engram daemon lifecycle (e2e)', () => {
  it.todo('engram start spawns a background process and writes .engram/running.json')

  it.todo('engram start polls /health until server is ready (up to 5s)')

  it.todo('engram start exits with error if already running')

  it.todo('/health endpoint returns { status: "ok", pid, uptime, version }')

  it.todo('engram stop sends SIGTERM and removes .engram/running.json')

  it.todo('engram stop force-kills with SIGKILL if process does not exit in 5s')

  it.todo('engram status shows running state with pid and port')

  it.todo('engram status shows stopped when no running.json exists')

  it.todo('POST /heartbeat upserts worktree_activity')

  it.todo('POST /snapshot creates a snapshot for active task')

  it.todo('POST /snapshot returns { ok: false, reason } when no active task')

  it.todo('GET /mcp establishes SSE connection')

  it.todo('MCP session_start tool returns null task for fresh worktree')

  it.todo('MCP update_task tool creates task and session_start returns it')
})
