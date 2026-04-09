# Engram — Progress Tracker

## Mission
Universal convention memory layer for agentic AI. Any agent, any domain, any team — every session builds on the last.

See [ARCHITECTURE.md](ARCHITECTURE.md) for design principles and extensibility strategy.

## Status: Phases 1–7 + Phase 9 Complete ✓ | Phase 8 Partially Landed | Hardening Sprint ✓ | 342 tests passing

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

## Phase 4 — Cross-Worktree Awareness ✓ DONE

**Goal:** Parallel agents are not invisible to each other.

### Completed
- [x] `worktree_activity` table — `worktree`, `task_id`, `active_files`, `last_heartbeat`
- [x] `pruneStale()` — deletes rows with `last_heartbeat` older than 10 min, called on every `session_start`
- [x] `session_start` returns `worktree_conflicts` (all other active worktrees)
- [x] `heartbeat.sh` — fires every 10 tool calls, sends `active_files`
- [x] `engram task --all` — shows all active worktrees with last heartbeat age
- [x] `get_worktree_status` MCP tool — `src/mcp/handlers/worktree.ts`
- [x] `file_conflicts: string[]` added to `session_start` response
- [x] `src/db/worktrees.ts` — `getFileConflicts()` helper
- [x] `engram task --all` — prunes stale before listing
- [x] `engram status` — shows active worktrees count + enforcement stats (checks/violations/warnings)
- [x] `/health` endpoint enriched — `active_worktrees`, `enforcement` stats
- [x] 157 tests passing (25 new: 14 worktree-handler + 11 http-heartbeat)

---

## Phase 5 — Convention Enforcement ✓ DONE

**Goal:** Violations caught before they are written.

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
- [x] 185 tests passing (29 new: 15 unit + 14 integration)

---

## Global Server + Service Installer ✓ DONE

**Goal:** Install once, works everywhere. One global launchd service on port 7337 serving any project on demand.

### Completed
- [x] `src/db/pool.ts` — `DbPool` class: on-demand project DB opening, `resolve(worktree)`, `getAllDbs()`, `closeAll()`
- [x] `src/server.ts` — global mode via `ENGRAM_GLOBAL=true`, `DbPool` replaces single `db`, `running.json` gains `mode` + `project_dir`
- [x] `src/mcp/tools.ts` — `setupTools(server, pool, globalDb)`, all 9 tools get optional `worktree` param, pool-based routing
- [x] HTTP handlers pool-based: `createHeartbeatHandler(pool)`, `createEnforceHandler(pool, ...)`, `createHealthHandler(pool, ...)`, `createSnapshotHandler(pool)`
- [x] `src/service/installer.ts` — `generatePlist()`, `getServiceLabel()`, `getPlistPath()` (pure, testable)
- [x] `src/cli/commands/service.ts` — `engram service install/uninstall/status`
- [x] `src/cli/utils/inject-claude-md.ts` — extracted from init.ts, returns `'created' | 'updated' | 'unchanged'`
- [x] `src/cli/commands/update-claude-md.ts` — `engram update-claude-md`
- [x] `src/cli/commands/init.ts` — uses shared inject-claude-md utility
- [x] `src/cli/commands/start.ts` — checks if port already in use before spawning
- [x] `src/cli/commands/stop.ts` — checks `~/.engram/running.json` (global) before per-project
- [x] `src/cli/index.ts` — registers `service` subcommands + `update-claude-md`
- [x] `hooks/enforce.sh` — adds `worktree=$(git rev-parse --show-toplevel)` to POST body
- [x] 185 tests passing (26 new: 8 db-pool + 10 service-installer + 8 update-claude-md)

---

## Phase 6 — Dynamic Scopes + Domain Profiles + Bootstrap/GC/Export ✓ DONE

**Goal:** Break out of hardcoded software scopes. Any domain can configure Engram for its context. Ship operational tooling.

### Completed
- [x] `src/domain/profiles.ts` — `DomainProfile` + `DomainAdapter` interfaces, profile registry, `SOFTWARE_SCOPES`
- [x] `src/domain/active-profile.ts` — module-level singleton: `setActiveProfile()`, `getActiveProfile()`, `getActiveScopes()`, `getActiveScopeAdapter()`
- [x] `src/domain/adapters/software.ts` — `SoftwareAdapter`: all 15-scope `fileToScope()` logic, registers on import
- [x] `src/domain/adapters/legal.ts` — 6 scopes: litigation, contracts, due_diligence, regulatory, research, general
- [x] `src/domain/adapters/research.ts` — 7 scopes: methodology, literature, data, analysis, writing, citations, general
- [x] `src/domain/adapters/general.ts` — single scope: general
- [x] `src/db/memories.ts` — `MemoryScope = string`, re-exports `SOFTWARE_SCOPES` from profiles
- [x] `src/retrieval/scope-detector.ts` — `fileToScope()` delegates to `getActiveScopeAdapter()`
- [x] `src/errors/normalizer.ts` — removed duplicate `fileToScope()`, imports from scope-detector
- [x] `src/mcp/tools.ts` — all 5 `z.enum(MEMORY_SCOPES)` replaced with `z.string().refine(s => getActiveScopes().includes(s))`
- [x] `src/mcp/handlers/memory.ts` — `scopeField()` factory, dynamic validation
- [x] `src/mcp/handlers/error.ts` — scope params use `z.string().optional()`
- [x] `src/http/enforce.ts` — scope validation uses `getActiveScopes()`
- [x] `src/config.ts` — `domain: string` field added (default `'software'`)
- [x] `src/server.ts` — `setActiveProfile(config.domain)` at startup
- [x] `src/cli/commands/init.ts` — `--domain <profile>` option, updates config
- [x] `src/cli/commands/bootstrap.ts` — `engram bootstrap`: detects ESM/CJS, test framework, Zod, TS, Express from `package.json`; seeds memories `confidence: 0.5, source: 'bootstrap'`
- [x] `src/cli/commands/gc.ts` — `engram gc`: archive confidence < 0.2, prune snapshots to 3/task, archive paused tasks > 60 days; appends to `.engram/gc.log`
- [x] `src/cli/commands/export.ts` — `engram export` (JSON file or stdout) + `engram import <file>` (merge or replace)
- [x] `src/cli/commands/apikey.ts` — `engram apikey generate/list/revoke`
- [x] `src/cli/index.ts` — all new commands registered
- [x] Tests: domain-profiles, dynamic-scopes, gc, export-import, auth-middleware
- [x] 240 tests passing (55 new)

---

## Phase 7 — Full REST API ✓ DONE

**Goal:** Any agent that speaks HTTP can use Engram without MCP.

### Completed
- [x] `src/http/api/middleware/auth.ts` — Bearer token validation (SHA256 hashes, off by default)
- [x] `src/http/api/middleware/worktree.ts` — `?worktree=` → `pool.resolve()` → `req.db`
- [x] `src/config.ts` — `apiKeyRequired: boolean`, `apiKeys: string[]` added
- [x] `src/http/api/v1/memories.ts` — GET/POST/PATCH/DELETE `/v1/memories[/:id]`
- [x] `src/http/api/v1/sessions.ts` — POST/GET/PATCH `/v1/sessions`, POST `/v1/sessions/:id/snapshot`
- [x] `src/http/api/v1/errors.ts` — POST `/v1/errors/check`, POST `/v1/errors/record`, GET `/v1/errors`
- [x] `src/http/api/v1/recall.ts` — POST `/v1/recall`
- [x] `src/http/api/v1/enforce.ts` — POST `/v1/enforce`
- [x] `src/http/api/v1/router.ts` — mounts auth + worktree middleware, all sub-routers
- [x] `src/http/api/openapi.ts` — hand-written OpenAPI 3.1 spec
- [x] `src/server.ts` — mounts `/v1` router, serves `GET /openapi.json`
- [x] `src/__tests__/test-app.ts` — `createTestApp()` helper for supertest integration tests
- [x] Integration tests: v1-memories, v1-sessions, v1-errors, v1-recall, v1-auth, openapi
- [x] 294 tests passing (54 new)

---

## Phase 9 — Auto-Extraction Observer ✓ DONE

**Goal:** Engram learns from sessions even when the agent never calls `remember()` explicitly.

### Completed
- [x] `src/observer/buffer.ts` — `EventBuffer`: flush on size OR timer, `add()`, `flush()`, `destroy()`, `size()`
- [x] `src/observer/extractor.ts` — `ExtractionEngine` interface, `buildPrompt()`, `parseExtractionResponse()`, `filterExisting()`
- [x] `src/observer/extractors/ollama.ts` — `OllamaExtractor`: POST `/api/chat`, 60s timeout, fallback to `/api/generate`
- [x] `src/observer/extractors/haiku.ts` — `HaikuExtractor`: POST Anthropic API, 30s timeout
- [x] `src/observer/writer.ts` — `RestApiWriter`: writes via `/v1/memories`, fetches context from `/v1/memories` + `/v1/sessions/current`
- [x] `src/observer/server.ts` — `createObserverApp()`: Express on port 7338, GET /health, POST /event, POST /flush
- [x] `src/observer/index.ts` — process entry point: reads config, picks extractor, starts server
- [x] `src/cli/commands/observer.ts` — `engram observer start/stop/status` (PID at `.engram/observer.pid`)
- [x] `src/cli/index.ts` — `engram observer start/stop/status` registered
- [x] `hooks/observer.sh` — PostToolUse hook: extracts tool/file/exit_status from stdin, POSTs to port 7338, always exits 0
- [x] `src/cli/commands/init.ts` — installs `observer.sh` + registers in `settings.json`
- [x] `src/config.ts` — `ObserverConfig` interface + `observer` field in `EngramConfig`
- [x] Tests: observer-buffer (11), observer-extractor (12), observer-server (8) — all passing
- [x] 294 tests passing

### How it works
1. Every PostToolUse event, `observer.sh` sends `{ tool, file_path, exit_status }` to port 7338
2. `EventBuffer` accumulates events; flushes when `batchSize` (default 10) reached OR `flushIntervalMs` (default 30s) expires
3. On flush: fetch active task + existing memories from REST API, run extraction prompt through llama3.2 (Ollama, free) or Claude Haiku (paid)
4. Extracted memories written with `source: 'observer', confidence: 0.4`
5. Enable with `observer.enabled: true` in `.engram/config.json`, then `engram observer start`

---

## Phase 8 — Semantic Retrieval + Contradiction Detection ⚠ In Progress (partially landed)

**Goal:** Find memories by meaning, not just keywords.

### Already in main
- [x] `memories.embedding BLOB` column + migration (`src/db/migrations/0005_embeddings.sql`)
- [x] `EmbeddingService` — Ollama `nomic-embed-text` + graceful FTS5 fallback
- [x] `updateMemoryEmbedding()`, `queryMemoriesWithEmbeddings()` in `src/db/memories.ts`
- [x] Contradiction detection in `handleRemember()` — cosine similarity > 0.85 → `contradicts_with` warnings
- [x] Hybrid reranking in `buildContextPacket()` — FTS5 + vector union
- [x] Per-tool telemetry (tool stats on `GET /v1/stats`, missing from OpenAPI spec)

### Still to implement
- [ ] `memory_edges` table: `(from_id, to_id, relation: 'implies'|'contradicts'|'supersedes'|'related')`
- [ ] `traverse_graph: true` option — return memory + graph neighbors via recursive CTE

---

## Hardening Sprint ✓ DONE

**Goal:** Fix contract gaps between MCP, REST, and observer. Re-baseline trust. SDK is unblocked.

### Completed
- [x] **`GET /v1/sessions/current` hardcoded fallback** — stored `req.worktree` in worktree middleware; removed `?? '/test/worktree'`, falls back to `process.cwd()` in non-global mode (`src/http/api/middleware/worktree.ts`, `src/http/api/v1/sessions.ts`)
- [x] **Worktree-unaware recall/write paths** — added `worktree?: string` to `RememberSchema` + `RecallSchema`; `detectScopes` and `project_origin` now use explicit worktree param (`src/mcp/handlers/memory.ts`); REST recall injects `req.worktree` (`src/http/api/v1/recall.ts`)
- [x] **REST memory writes bypass semantic pipeline** — `EmbeddingService` threaded through `createV1Router` → `createMemoriesRouter` → `createRecallRouter`; `POST /v1/memories` now calls `handleRemember()` (embeddings + contradiction detection); `source: 'observer'` added to enum with correct 0.4 confidence (`src/http/api/v1/memories.ts`, `router.ts`, `server.ts`, `test-app.ts`)
- [x] **Shallow config merge** — `deepMerge()` helper replaces spread in `loadConfig()`; partial `observer`/`semanticRetrieval` blocks preserve defaults (`src/config.ts`)
- [x] **`GET /v1/stats` missing from OpenAPI** — documented with full tool + enforcement response schema; `POST /v1/memories` response updated with `contradicts_with` shape (`src/http/api/openapi.ts`)
- [x] Regression tests: `config.test.ts` (new, 7 tests), extensions to `v1-sessions`, `memory-handler`, `v1-memories`, `v1-recall`
- [x] **342 tests passing** (up from 323)

---

## Phase 10 — TypeScript SDK (`@engram/sdk`)

**Goal:** Any agent framework gets Engram with 3 lines of code.

### To implement
- [ ] npm package; talks to REST API (not SQLite directly)
- [ ] `EngramClient` — session lifecycle, memory injection, error pattern checking
- [ ] LangGraph adapter — `withEngram(graph, client)` wraps tool nodes as middleware
- [ ] LangChain adapter — `EngramCallbackHandler`
- [ ] AutoGen adapter — `MemoryAwareAgent` base class

---

## Phase 11 — Cloud Sync + Team Memory

**Goal:** Engram as team infrastructure.

### To implement
- [ ] Sync daemon — mirrors local SQLite to hosted PostgreSQL asynchronously
- [ ] Team namespaces by `project_id` (hash of repo remote URL)
- [ ] `StorageBackend` interface — SQLite and PostgreSQL both implement it
- [ ] Paid tier: cloud sync, team namespaces, admin dashboard, SLA

---

## Phase 12 — Memory Marketplace

**Goal:** Community-sourced intelligence, bootstrap new projects instantly.

### To implement
- [ ] Auto-promotion: memory in 3+ projects with confidence ≥ 0.7 → community pool candidate
- [ ] Memory packages: `engram import @engram/memories-react`
- [ ] Private packages for team conventions
- [ ] Package format: curated JSON export (Phase 6 format, version-pinned)

---

## Backlog — Feedback-Sourced Improvements

- [ ] **Per-tool telemetry** — extend `EnforcementStats` pattern to all MCP tools. Track: session_start hit/miss rate, check_error hit rate, recall query patterns, remember call volume.
- [x] **`engram update-claude-md`** — re-inject latest CLAUDE.md template into existing projects.
- [ ] **Global memory auto-promotion** — promote memory to global after N≥3 distinct projects with confidence≥0.7.
- [ ] **`update_task` tool description** — explicitly document create-on-missing behaviour.
