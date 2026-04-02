# Engram — Architecture

## Mission

Engram is a universal convention memory layer for agentic AI. Any agent, in any domain, working for any user or team, should be able to call Engram to persist what it learns and recall what came before — so that every session builds on the last.

---

## Design Principles

### 1. Agent-Agnostic
Engram makes no assumptions about which AI agent is calling it. The MCP tools (`session_start`, `remember`, `recall`, `check_error`, `record_error`, `update_task`) are verbs that any agent can call. The REST API exposes the same operations for agents that don't support MCP. An SDK will allow embedding Engram's context layer into any agent framework directly.

### 2. Domain-Agnostic
The memory schema is deliberately generic. A `convention` memory might be:
- "Always use Zod at API boundaries" (software engineering)
- "Always cite primary sources before secondary" (legal research)
- "Never quote forward earnings in client-facing documents" (finance)

Domain profiles define valid scopes and file-to-scope inference. The `software` profile is the default; `legal`, `research`, and `general` profiles ship out of the box. Custom profiles can be registered programmatically.

### 3. Protocol-First
Engram defines a **protocol** for structured agent memory, not just a tool. The core primitives — session state, typed memories, error patterns, scope-based retrieval, confidence scoring — are stable contracts. The local server is the reference implementation. Future implementations (cloud, embedded SDK, third-party) implement the same protocol.

### 4. Composable Transports

| Transport | Status | Use case | Auth |
|---|---|---|---|
| MCP (streamable HTTP) | ✓ Live | Claude Code, Cursor, any MCP-compatible agent | N/A (localhost) |
| REST API v1 | ✓ Live | LangGraph, AutoGen, any HTTP client | Bearer token (SHA256, optional) |
| TypeScript SDK | Planned (Phase 10) | Embed directly in agent frameworks | Inherits from REST |
| Python SDK | Planned (Phase 10) | Same | Same |

### 5. Local-First, Cloud-Ready
All data lives locally by default (SQLite, zero external dependencies). The DB layer is isolated so a PostgreSQL backend for cloud/team deployments can be added without changing the API surface or business logic.

---

## Transport Layer

### MCP (streamable HTTP)
- Endpoint: `http://localhost:7337/mcp`
- Protocol: MCP streamable HTTP (replaced SSE in Phase 4)
- Tools: `session_start`, `remember`, `recall`, `invalidate`, `update_task`, `check_error`, `record_error`, `get_worktree_status`, `check_conventions`

### REST API v1
- Base: `http://localhost:7337/v1`
- All endpoints accept `?worktree=<absolute-path>` for project routing
- Auth: `Authorization: Bearer <token>` — off by default, enabled via `engram apikey generate`
- Spec: `GET /openapi.json` (OpenAPI 3.1)

Key endpoints:
```
POST   /v1/memories          → 201 { id }
GET    /v1/memories          → 200 { memories[], total }
PATCH  /v1/memories/:id      → 200 { ok }
DELETE /v1/memories/:id      → 200 { ok }

POST   /v1/sessions          → 200 ContextPacket
GET    /v1/sessions/current  → 200 { task, state } | 404
PATCH  /v1/sessions/current  → 200 { task_id }
POST   /v1/sessions/:id/snapshot → 201 { snapshot_id }

POST   /v1/errors/check      → 200 { found, fix? }
POST   /v1/errors/record     → 201 { id }
GET    /v1/errors            → 200 { errors[] }

POST   /v1/recall            → 200 ContextPacket
POST   /v1/enforce           → 200 { violations[], warnings[] }
```

### Legacy HTTP (hooks compatibility)
Unversioned endpoints kept for backward compat with existing hook scripts:
- `POST /heartbeat` — worktree activity ping
- `POST /snapshot` — manual snapshot trigger
- `POST /enforce` — convention enforcement (called by `enforce.sh`)
- `GET /health` — server status

---

## Domain Adapter Pattern

### Problem
`MEMORY_SCOPES` was a hardcoded 15-element tuple, coupling Engram to software development. Zod schemas used `z.enum(MEMORY_SCOPES)`, requiring compile-time knowledge of all valid scopes.

### Solution
A `DomainProfile` bundles a scope list and a `DomainAdapter` for file-to-scope inference. Profiles register themselves at import time. The active profile is a module-level singleton.

```typescript
// src/domain/profiles.ts
interface DomainAdapter {
  fileToScope(filePath: string): string | null  // null → caller uses 'general'
}

interface DomainProfile {
  name: string
  description: string
  scopes: readonly string[]
  adapter: DomainAdapter
}

// src/domain/active-profile.ts
setActiveProfile(name: string): void       // called at server startup from config
getActiveProfile(): DomainProfile          // defaults to 'software'
getActiveScopes(): readonly string[]
getActiveScopeAdapter(): DomainAdapter
```

**Registration:** each adapter file calls `registerProfile()` on import. `active-profile.ts` imports all 4 built-ins, ensuring they're registered before any call to `resolveProfile()`.

**Zod migration:** `z.enum(MEMORY_SCOPES)` → `z.string().refine(s => getActiveScopes().includes(s))`. Runtime dynamic validation. All 5 affected tool schemas updated.

**No DB migration needed:** `memories.scope` was always stored as `TEXT NOT NULL` in SQLite. The 15-value constraint was application-level only.

### Built-in Profiles

| Profile | Scopes | fileToScope |
|---|---|---|
| `software` (default) | auth, api, components, database, testing, config, general, build, types, utils, services, state, routing, infra, scripts | Full path-pattern matching for all 15 scopes |
| `legal` | litigation, contracts, due_diligence, regulatory, research, general | Always returns null (no path inference) |
| `research` | methodology, literature, data, analysis, writing, citations, general | Always returns null |
| `general` | general | Always returns null |

---

## Observer (Auto-Extraction Sidecar)

### Purpose
Engram learns from sessions passively — without the agent ever calling `remember()`.

### Architecture
- Runs as a separate process on port 7338 (not blocking the MCP server)
- `PostToolUse` hook sends tool metadata (name, file path, exit status) to `/event`
- `EventBuffer` accumulates events; flushes on `batchSize` (default 10) OR `flushIntervalMs` (default 30s)
- On flush: fetch active task + existing memories from REST API v1, call LLM extraction, write memories back via REST API

### Privacy
The hook sends **metadata only** (tool name, file path, exit status) — never file contents. The extraction prompt operates on the pattern of tool calls, not the code itself.

### Extractors
| Extractor | Model | Cost | Config |
|---|---|---|---|
| `OllamaExtractor` (default) | llama3.2 via local Ollama | Free | `observer.model: 'ollama'` |
| `HaikuExtractor` | claude-haiku-4-5-20251001 | Paid | `observer.model: 'haiku'`, `observer.haikuApiKey` |

### Memory source
Extracted memories are written with `source: 'observer', confidence: 0.4`. Lower starting confidence than explicit `remember()` calls (0.5). Rises with validation, sinks without.

### Free/Paid Boundary
- **Free:** All MCP tools, all REST v1 endpoints, FTS5 recall, unlimited local use, observer with local Ollama
- **Paid (future):** Cloud sync, team memory namespaces, dashboard, observer with Haiku for higher quality extraction

### Enabling the Observer
1. Set `observer.enabled: true` in `.engram/config.json`
2. Run `engram observer start`
3. `engram observer status` shows buffer size and last flush time

---

## Storage Architecture

### Current: SQLite
- Per-project: `<project>/.engram/db.sqlite`
- Global: `~/.engram/global.db` (cross-project memories)
- WAL mode enabled, synchronous = NORMAL
- `DbPool` (`src/db/pool.ts`) — global server opens project DBs on demand per request

### Planned: PostgreSQL
The DB layer (`src/db/`) is isolated from all business logic. Every DB function takes an explicit `Database` instance. A `StorageBackend` interface for cloud/team deployments can be added without changing the API surface.

---

## Extraction Pipeline — Memory Sources

| Source | Who writes | Starting confidence | Notes |
|---|---|---|---|
| `agent` | Agent calls `remember()` | 0.5 | Explicit, most trusted |
| `observer` | Observer sidecar (auto) | 0.4 | Passive, requires validation |
| `bootstrap` | `engram bootstrap` CLI | 0.5 | One-time codebase analysis |
| `manual` | Human via REST API | 0.8 | Human-curated, highest trust |

---

## Core Primitives

### Sessions
A session is a single continuous working context for an agent on a given project. Sessions carry forward task state (what was in progress, what decisions were made, which resources were touched) so agents resume context after compaction, restart, or handoff to another agent.

### Memories
Typed, scoped, confidence-scored facts that persist across sessions.

| Type | Purpose |
|---|---|
| `convention` | How things should be done |
| `decision` | Why something was done a particular way |
| `anti_pattern` | What NOT to do and why |
| `snippet` | Reusable patterns or templates |
| `error_pattern` | Known errors and their resolutions |

### Scopes
Domain-defined categories that group memories for targeted retrieval. **Scopes are configurable; the default set targets software development but is not the only valid set.**

### Error Patterns
Normalised, deduplicated error signatures. The same underlying error — regardless of machine, path, line number, or timestamp — maps to the same 16-char hex signature via SHA256 of the normalised text.

### Confidence & Recency
Every memory carries a confidence score (0.0–1.0) and timestamps. Retrieval ranks by:

```
score = confidence × recencyFactor(last_validated) × scopeMatchBoost(scope, active_scopes)
```

Confidence decays lazily over time (no DB mutations at read time). High-confidence, recent, scope-matched memories surface first.

---

## Known Design Tensions

### Tool naming: `update_task`
`update_task` both creates AND updates tasks (create-on-missing). Agents starting fresh may not reach for it. Alternatives considered: `sync_task`. Decision deferred — the tool description must explicitly state create-on-missing behaviour.

### Dual enforcement paths
Convention enforcement has two surfaces: `POST /enforce` (called by `enforce.sh` hook, pre-write interception) and `check_conventions` MCP tool (called directly by the agent mid-session). These serve different purposes. The hook is automatic and passive; the MCP tool is proactive and explicit. Both are necessary.

### `check_error` + `record_error` as two tools
Two-phase design is deliberate: look up first (cheap, returns immediately if known), record after resolving (enriches the DB). A merged `error()` tool would be simpler for agents but loses the ability to short-circuit on lookup. Keep two tools.

### Global vs project memories
The line between `global: true` (cross-project, `~/.engram/global.db`) and project-local is blurry. Current state: agent decides via `global` parameter on `remember()`. Future: auto-promotion based on recurrence across projects (Phase 12).

---

## Boundaries: What Stays General

When adding any feature, ask: **does this only work for software/coding agents, or does it work for any agent in any domain?**

| Component | Can be domain-specific | Must stay general |
|---|---|---|
| Default scope set | ✓ | — |
| `fileToScope()` implementation | ✓ | — |
| Claude Code hooks (enforce.sh etc) | ✓ | — |
| Memory schema (types, confidence, scopes) | — | ✓ |
| Confidence scoring & recency decay | — | ✓ |
| Retrieval ranking logic | — | ✓ |
| MCP tool signatures | — | ✓ |
| Error normaliser | — | ✓ |
| Session state structure | — | ✓ |
| REST API surface | — | ✓ |

---

## Current Implementation Status

| Feature | Phase | Status |
|---|---|---|
| MCP server (streamable HTTP) | 1 | ✓ Live |
| Session state (tasks, snapshots) | 1 | ✓ Live |
| Project memory (FTS5, ranked retrieval) | 2 | ✓ Live |
| Global memory (cross-project) | 2 | ✓ Live |
| Error intelligence (signatures, upsert) | 3 | ✓ Live |
| Cross-worktree awareness | 4 | ✓ Live |
| Convention enforcement (check_conventions, POST /enforce) | 5 | ✓ Live |
| Global server + launchd service installer | — | ✓ Live |
| Dynamic scopes / domain profiles | 6 | ✓ Live |
| Bootstrap / GC / Export-Import / API keys | 6 | ✓ Live |
| Full REST API v1 + OpenAPI spec | 7 | ✓ Live |
| Auto-extraction observer sidecar | 9 | ✓ Live |
| Semantic retrieval (vector + contradiction) | 8 | Planned |
| TypeScript/Python SDK | 10 | Planned |
| Cloud sync & team sharing | 11 | Planned |
| Memory marketplace | 12 | Planned |
