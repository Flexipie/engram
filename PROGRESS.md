# Engram — Progress Tracker

## Mission
Universal convention memory layer for agentic AI. Any agent, any domain, any team — every session builds on the last.

See [ARCHITECTURE.md](ARCHITECTURE.md) for design principles and extensibility strategy.

## Status: Phase 3 Complete ✓

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

### To implement
- [ ] `get_worktree_status` MCP tool
- [ ] Heartbeat pruning (>10 min stale → inactive)
- [ ] Active resource conflict detection surfaced in `session_start` response
- [ ] CLI: `engram task --all`

### Tests to write first
- `src/__tests__/integration/worktree-handler.test.ts`
- `src/__tests__/integration/http-heartbeat.test.ts`

---

## Phase 5 — Convention Enforcement

**Goal:** Violations caught before they are written. Agent-agnostic — works for any domain, not just code.

### To implement
- [ ] `/enforce` HTTP endpoint (`src/http/enforce.ts`) — callable by any agent or hook
- [ ] Convention checker (`src/enforcement/checker.ts`) — reads memories ≥ 0.6 confidence for scope, domain-agnostic
- [ ] Warn threshold 0.6 → warning response; Block threshold 0.8 → block response
- [ ] Claude Code hook integration (`enforce.sh`) as one adapter, not the only one
- [ ] `enforced` MCP tool — so any agent can call enforcement directly without HTTP
- [ ] `engram status` shows enforcement activity

### Tests to write first
- `src/__tests__/unit/enforcement-checker.test.ts`
- `src/__tests__/integration/http-enforce.test.ts`

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

## Future — Cloud + SDK

**Goal:** Engram as infrastructure, not just a local tool.

- [ ] PostgreSQL storage backend (same interface as SQLite layer)
- [ ] Cloud sync — local DB mirrors to hosted store, follows user across machines
- [ ] Team sharing — multiple agents on same repo feed the same knowledge base
- [ ] TypeScript SDK — `import { EngramClient } from 'engram'` for embedding in agent frameworks
- [ ] Python SDK
- [ ] Web dashboard — browse/manage memories, view enforcement analytics
- [ ] Multi-tenant auth for hosted deployments
