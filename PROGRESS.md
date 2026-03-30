# Engram — Progress Tracker

## Mission
Universal convention memory layer for agentic AI. Any agent, any domain, any team — every session builds on the last.

See [ARCHITECTURE.md](ARCHITECTURE.md) for design principles and extensibility strategy.

## Status: Phase 4 + 5 Complete ✓

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

## Phase 3 — Error Intelligence ✓ DONE

**Goal:** Known errors resolve instantly.

### Completed
- [x] `error_patterns` table migration (`0004_errors.sql`) — signature, raw, normalized, cause, fix, scope, recurrence, last_seen
- [x] Error signature normalizer (`src/errors/normalizer.ts`) — strip ANSI, absolute paths, line:col, hex addresses, timestamps, UUIDs → SHA256 → 16-char hex
- [x] `check_error` MCP tool — O(1) signature lookup, increments recurrence on hit
- [x] `record_error` MCP tool — upsert: insert new or update cause/fix + recurrence
- [x] `src/db/errors.ts` — lookupBySignature, insertErrorPattern, upsertErrorPattern, incrementRecurrence, listErrorPatterns
- [x] `src/mcp/handlers/error.ts` — handleCheckError, handleRecordError
- [x] CLI: `engram errors [--scope] [--json] [--verbose]`
- [x] CLAUDE.md template updated with check_error/record_error workflow
- [x] 103 tests passing (39 new: 20 unit normalizer + 19 integration error-handler)

---

## Phase 4 — Cross-Worktree Awareness

**Goal:** Parallel agents are not invisible to each other.

### Already done (infrastructure from Phase 1)
- [x] `worktree_activity` table — `worktree`, `task_id`, `active_files`, `last_heartbeat`
- [x] `pruneStale()` — deletes rows with `last_heartbeat` older than 10 min, called on every `session_start`
- [x] `session_start` returns `worktree_conflicts` (all other active worktrees)
- [x] `heartbeat.sh` — fires every 10 tool calls, sends `active_files`
- [x] `engram task --all` — shows all active worktrees with last heartbeat age

### To implement
- [ ] `get_worktree_status` MCP tool — mid-session check without re-running `session_start`
  - Returns: `{ active_worktrees: [{ worktree, task_title, task_goal, active_files, age_seconds }], file_conflicts: string[] }`
  - `file_conflicts`: current worktree's task `key_files` ∩ other worktrees' `active_files` (Option A)
- [ ] Add `file_conflicts: string[]` to `session_start` response — compare task `key_files` vs other worktrees' `active_files`
- [ ] `pruneStale()` called before `getActiveWorktrees()` in `engram task --all`
- [ ] `engram status` shows active worktrees count + enforcement stats (checks/violations since start)

### File conflict detection: Option A (confirmed)
Compare current worktree's **task `key_files`** (from previous session, persistent) against other worktrees' **`active_files`** (from heartbeat, live).
Rationale: works at session start before the agent has sent any heartbeats.

### Completed
- [x] `get_worktree_status` MCP tool — `src/mcp/handlers/worktree.ts`
- [x] `file_conflicts: string[]` added to `session_start` response
- [x] `src/db/worktrees.ts` — `getFileConflicts()` helper
- [x] `engram task --all` — prunes stale before listing
- [x] `engram status` — shows active worktrees count + enforcement stats (checks/violations/warnings)
- [x] `/health` endpoint enriched — `active_worktrees`, `enforcement` stats
- [x] 157 tests passing (25 new: 14 worktree-handler + 11 http-heartbeat)

---

## Phase 5 — Convention Enforcement ✓ DONE

**Goal:** Violations caught before they are written. Agent-agnostic — works for any domain, not just code.

### Completed
- [x] `src/enforcement/checker.ts` — `checkConventions()` using effective score (confidence × recency × scope boost)
- [x] `/enforce` HTTP endpoint (`src/http/enforce.ts`) — POST with `file_path`, returns violations/warnings
- [x] `check_conventions` MCP tool (`src/mcp/handlers/enforce.ts`) — same logic, direct MCP access
- [x] `hooks/enforce.sh` updated — prints warnings to stderr, exits 2 on violations
- [x] `src/retrieval/scope-detector.ts` expanded — all 15 scopes covered, `fileToScope` exported
- [x] In-memory enforcement stats (`enforcementStats`) — tracks checks/violations/warnings since start
- [x] `decision` type memories max out at warnings (never block)
- [x] `snippet` and `error_pattern` types excluded from enforcement checks
- [x] Stale memories (>90 days) get recency factor 0.5 — less likely to block
- [x] 132 tests passing (29 new: 15 unit + 14 integration)

---

## Phase 6 — Dynamic Scopes + Domain Profiles

**Goal:** Break out of hardcoded software scopes. Any domain can configure Engram for its context.

### To implement
- [ ] Domain profile schema — config object: `{ scopes, scopeAdapter, defaultMemoryTypes }`
- [ ] Make `MEMORY_SCOPES` dynamic — loaded from domain profile, not hardcoded in source
- [ ] Scope adapter interface — pluggable `(context) => scope` function
- [ ] Built-in profiles: `software` (current default), `legal`, `research`
- [ ] `engram init --domain <profile>` — init with a specific domain profile
- [ ] Config schema updated: `domain` field

### Tests to write first
- `src/__tests__/unit/domain-profiles.test.ts`
- `src/__tests__/integration/dynamic-scopes.test.ts`

---

## Phase 7 — Full REST API

**Goal:** Any agent that can make HTTP requests can use Engram, without MCP support.

### To implement
- [ ] `POST /api/memories` — insert memory
- [ ] `GET /api/memories` — query memories (scope, type, query params)
- [ ] `POST /api/sessions/start` — session_start equivalent
- [ ] `PATCH /api/sessions/:id` — update_task equivalent
- [ ] `POST /api/errors/check` — check_error equivalent
- [ ] `POST /api/errors/record` — record_error equivalent
- [ ] API key auth (simple, single-tenant for local; multi-tenant for cloud)
- [ ] OpenAPI spec generated from routes

### Tests to write first
- `src/__tests__/integration/rest-api.test.ts`

---

## Phase 8 — Bootstrap + Polish

**Goal:** Day-one value for new projects, npm publishable.

### To implement
- [ ] `engram bootstrap` — analyse project and seed memories from existing patterns
  - Software: ts-morph AST (imports, exports, Zod usage)
  - General: configurable via domain profile bootstrap adapter
- [ ] `engram gc` — prune stale data (low-confidence memories, old snapshots, paused tasks)
- [ ] `engram export` — full JSON backup (portable across instances)
- [ ] `engram snapshots --restore <id>` — manual restore
- [ ] npm publish prep (README, `files` field, bin entry)

### Tests to write first
- `src/__tests__/unit/bootstrap-extractor.test.ts`
- `src/__tests__/integration/gc.test.ts`
- `src/__tests__/integration/export.test.ts`

---

## Backlog — Feedback-Sourced Improvements

Items identified from design review, not phase-assigned yet:

- [ ] **Per-tool telemetry** — extend `EnforcementStats` pattern to all MCP tools. Track: session_start hit/miss rate on task, check_error hit rate, recall query patterns, remember call volume by type/scope. Expose via `/health` or new `/stats` endpoint.
- [ ] **`engram update-claude-md`** — re-inject latest CLAUDE.md template into existing projects using sentinel markers. Needed so improvements to the template reach projects that ran `engram init` earlier.
- [ ] **Global memory decision rule** — auto-promote a memory to global after it appears in N≥3 distinct projects with confidence≥0.7. Today agents must decide manually via `global: true`.
- [ ] **`update_task` tool description** — explicitly document create-on-missing behaviour so agents starting fresh know to call it. Consider alias `sync_task`.
- [ ] **CLAUDE.md template length** — current template is concise post-Phase-5. Monitor if agents are following the error workflow (check_error first) in practice. Tighten further if not.

---

## Future — Cloud + SDK

**Goal:** Engram as infrastructure, not just a local tool.

- [ ] PostgreSQL storage backend (same interface as SQLite layer)
- [ ] Cloud sync — local DB mirrors to hosted store, follows user across machines
- [ ] Team sharing — multiple agents on same repo feed the same knowledge base
- [ ] TypeScript SDK — `import { EngramClient } from 'engram'` for embedding in agent frameworks
- [ ] Python SDK
- [ ] Web dashboard — browse/manage memories, view enforcement analytics
- [ ] Multi-tenant auth for hosted deployments
