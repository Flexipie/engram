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

Scopes are configurable per-deployment, not hardcoded globally. The retrieval and confidence scoring logic is unaware of what domain it's serving.

### 3. Protocol-First
Engram defines a **protocol** for structured agent memory, not just a tool. The core primitives — session state, typed memories, error patterns, scope-based retrieval, confidence scoring — are stable contracts. The local server is the reference implementation. Future implementations (cloud, embedded SDK, third-party) implement the same protocol.

### 4. Composable Transports

| Transport | Status | Use case |
|---|---|---|
| MCP (streamable HTTP) | Live | Claude Code, Cursor, any MCP-compatible agent |
| REST HTTP | Partial | Any agent that can make HTTP requests |
| SDK (TS/Python) | Planned | Embed directly in agent frameworks |

### 5. Local-First, Cloud-Ready
All data lives locally by default (SQLite, zero external dependencies). The DB layer is isolated so a PostgreSQL backend for cloud/team deployments can be added without changing the API surface or business logic.

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
Domain-defined categories that group memories for targeted retrieval. In software projects these map to areas like `api`, `database`, `testing`. In legal work they might be `litigation`, `due_diligence`, `contracts`. **Scopes are configurable; the default set targets software development but is not the only valid set.**

### Error Patterns
Normalised, deduplicated error signatures. The same underlying error — regardless of machine, path, line number, or timestamp — maps to the same 16-char hex signature via SHA256 of the normalised text. Supports recurrence tracking so recurring errors surface first.

### Confidence & Recency
Every memory carries a confidence score (0.0–1.0) and timestamps. Retrieval ranks by:

```
score = confidence × recencyFactor(last_validated) × scopeMatchBoost(scope, active_scopes)
```

Confidence decays lazily over time (no DB mutations at read time). High-confidence, recent, scope-matched memories surface first.

---

## Extensibility Points

### Scope Adapters (planned)
`fileToScope()` in `src/retrieval/scope-detector.ts` is the current scope inference — it reads git status and maps file paths to scopes. This becomes a pluggable adapter interface so domains can provide their own scope inference logic (e.g. a legal adapter that infers scope from document type or matter metadata).

### Domain Profiles (planned)
A domain profile is a configuration object that defines:
- The set of valid scopes for that domain
- Scope adapter to use for auto-detection
- Default memory types to surface
- Any domain-specific retrieval weighting

Domain profiles let Engram be deployed for legal, research, or finance teams without code changes — just configuration.

### Storage Backends (planned)
The DB layer (`src/db/`) is isolated from all business logic. Every DB function takes an explicit `Database` instance. A PostgreSQL implementation of the same interface enables cloud sync and team-shared knowledge bases.

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
| Convention enforcement | 5 | Planned |
| Dynamic scopes / domain profiles | — | Planned |
| Full REST API | — | Planned |
| PostgreSQL backend | — | Future |
| TypeScript/Python SDK | — | Future |
| Cloud sync & team sharing | — | Future |
