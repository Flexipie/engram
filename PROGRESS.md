# Engram — Progress Tracker

## Status: Phase 2 Complete ✓

---

## Phase 1 — Foundation + Session State ✓ DONE

**Goal:** Solve compaction problem. Give agents session state that survives compaction.

### Completed
- [x] Package setup (Node 20, TypeScript 5.4+, ES2022, ESM, strict)
- [x] Migration system + WAL setup (`src/db/connection.ts`, `src/db/migrations/0001_init.sql`)
- [x] Tables: tasks, task_state, snapshots, worktree_activity, _schema_version
- [x] `session_start` MCP tool — resumes task state, returns worktree conflicts
- [x] `update_task` MCP tool — partial updates, creates task if none exists
- [x] HTTP: `GET /health`, `POST /heartbeat`, `POST /snapshot`
- [x] Scope detector — `git status` → file-to-scope mapping
- [x] `PreCompact` hook (`snapshot.sh`) — auto-snapshot before compaction
- [x] `PostToolUse` hook (`heartbeat.sh`) — throttled every 10 calls
- [x] `PreToolUse` hook (`enforce.sh`) — stub for Phase 5
- [x] CLI: `engram init`, `engram start`, `engram stop`, `engram status`, `engram task`
- [x] CLAUDE.md injection (sentinel-based, idempotent)
- [x] `.claude/settings.json` hook merge (idempotent)
- [x] 30 unit + integration tests passing

### Verification checklist (manual)
- [ ] `engram init` in a test project — check `.engram/`, `CLAUDE.md`, `.claude/settings.json`
- [ ] `engram start` — check PID file, `/health` responds
- [ ] Connect Claude Code to `http://localhost:7337/mcp` — call `session_start()`
- [ ] Call `update_task({ title, goal })` — verify returns `{ task_id }`
- [ ] Trigger compaction → `snapshot.sh` fires → snapshot row in DB
- [ ] Call `session_start()` again — verify task field populated

---

## Phase 2 — Project Memory + Global Memory ✓ DONE

**Goal:** Agent stops making the same mistakes.

### Completed
- [x] `memories` table with FTS5 (porter + unicode61 tokenizer) + sync triggers (`0002_memories.sql`)
- [x] `global_memories` table in `~/.engram/global.db` (`0003_global.sql`)
- [x] `src/db/memories.ts` — insertMemory, queryMemories, invalidateMemory, getMemoryById, boostConfidence, decreaseConfidence
- [x] `src/db/global.ts` — openGlobalDb(), insertGlobalMemory(), queryGlobalMemories()
- [x] `remember` MCP tool
- [x] `recall` MCP tool (FTS + filter + ranking)
- [x] `invalidate` MCP tool
- [x] Retrieval ranker (`src/retrieval/ranker.ts`) — `score = confidence × recencyFactor × scopeMatchBoost`
- [x] ContextPacket builder (`src/retrieval/context-packet.ts`) — critical/relevant/antipatterns/global buckets, cap 15
- [x] `session_start` updated to return live ContextPacket
- [x] Global DB opened lazily based on `alwaysIncludeGlobal` config
- [x] Global memory query support (`include_global: true`)
- [x] Confidence decay computed at query time (lazy — no DB mutation)
- [x] CLI: `engram memories [--scope] [--type] [--json]`, `engram invalidate <id>`
- [x] Config: `alwaysIncludeGlobal`, `minRecallConfidence` fields added
- [x] 64 tests passing (unit + integration)

---

## Phase 3 — Error Intelligence

**Goal:** Known errors resolve instantly.

### To implement
- [ ] `error_patterns` table migration (`0004_errors.sql`)
- [ ] Error signature normalizer — strip ANSI, paths, line:col, addresses, timestamps, UUIDs → SHA256 → 16-char hex
- [ ] `check_error` MCP tool
- [ ] `record_error` MCP tool
- [ ] `src/db/errors.ts` — lookupErrorSignature, insertErrorPattern, incrementRecurrence
- [ ] CLI: `engram errors [--scope]`
- [ ] CLAUDE.md template updated with error workflow

### Tests to write first
- `src/__tests__/unit/error-normalizer.test.ts`
- `src/__tests__/integration/error-handler.test.ts`

---

## Phase 4 — Cross-Worktree Awareness

**Goal:** Parallel agents are not invisible to each other.

### To implement
- [ ] `get_worktree_status` MCP tool
- [ ] Heartbeat pruning (>10 min stale → inactive)
- [ ] Active file conflict detection surfaced in `session_start` response
- [ ] CLI: `engram task --all`

### Tests to write first
- `src/__tests__/integration/worktree-handler.test.ts`
- `src/__tests__/integration/http-heartbeat.test.ts`

---

## Phase 5 — Convention Enforcement

**Goal:** Violations caught before they are written.

### To implement
- [ ] `/enforce` HTTP endpoint (`src/http/enforce.ts`)
- [ ] Convention checker (`src/enforcement/checker.ts`) — reads memories ≥ 0.6 confidence for scope
- [ ] Warn threshold 0.6 → exit 0 with message; Block threshold 0.8 → exit 2
- [ ] `enforce.sh` hook properly reads stdin JSON, extracts `tool_input.file_path`
- [ ] `engram status` shows enforcement activity

### Tests to write first
- `src/__tests__/unit/enforcement-checker.test.ts`
- `src/__tests__/integration/http-enforce.test.ts`

---

## Phase 6 — Bootstrap + Polish

**Goal:** Day-one value, npm publishable.

### To implement
- [ ] `engram bootstrap` — ts-morph AST analysis (import patterns, Zod usage, exports, function signatures) → seed memories at confidence 0.5
- [ ] `corrections` table + `simple-git` post-commit hook for diff capture
- [ ] `engram gc` — archive low-confidence memories, prune old snapshots (keep last 3), prune 6-month corrections, archive 60-day-paused tasks
- [ ] `engram export` — full JSON backup
- [ ] `engram snapshots --restore <id>` — manual restore
- [ ] npm publish prep (README, bin entry, `files` field)

### Tests to write first
- `src/__tests__/unit/bootstrap-extractor.test.ts`
- `src/__tests__/integration/gc.test.ts`
- `src/__tests__/integration/export.test.ts`
