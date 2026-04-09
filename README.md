# Engram — Universal Agent Memory

Engram is a local-first memory server for AI agents. Any agent — Claude Code, Cursor, LangGraph, AutoGen, or a custom HTTP client — can call Engram to persist what it learns and recall what came before, so every session builds on the last.

This is not a smarter CLAUDE.md. It is not a vector store. It is a **memory protocol**: typed, scoped, confidence-scored facts that agents write and recall with structured precision, plus session state that survives compaction and restarts.

---

## Quick Start

```bash
npm install -g engram

engram init          # create .engram/ + inject Claude Code hooks
engram start         # start MCP server on localhost:7337
```

Connect Claude Code to `http://localhost:7337/mcp`. Done. Every session is now smarter than the last.

---

## Three Integration Paths

### 1. MCP — Claude Code, Cursor, any MCP-compatible agent

Add to your MCP client config:
```json
{ "url": "http://localhost:7337/mcp" }
```

Nine tools available immediately: `session_start`, `remember`, `recall`, `invalidate`, `update_task`, `check_error`, `record_error`, `get_worktree_status`, `check_conventions`.

### 2. REST API — LangGraph, AutoGen, any HTTP client

```bash
# Write a memory
curl -X POST http://localhost:7337/v1/memories \
  -H "Content-Type: application/json" \
  -d '{"type":"convention","scope":"api","content":"Always validate with Zod at API boundaries"}'

# Recall relevant memories
curl -X POST http://localhost:7337/v1/recall \
  -H "Content-Type: application/json" \
  -d '{"query":"validation","scopes":["api"]}'

# OpenAPI spec
curl http://localhost:7337/openapi.json
```

Full spec at `GET /openapi.json`. Auth is off by default (localhost assumption); enable with `engram apikey generate`.

### 3. Observer — Passive auto-extraction (Phase 9)

The observer sidecar watches every tool call and automatically extracts repo-wide convention memories using a local LLM — even when the agent never calls `remember()` explicitly.

```bash
# Enable in .engram/config.json
# "observer": { "enabled": true, "model": "ollama", "ollamaModel": "llama3.2" }

engram observer start    # starts sidecar on port 7338
engram observer status   # shows buffer size + last flush
```

Requires [Ollama](https://ollama.com) running locally with `llama3.2` pulled. Free. No API keys.

---

## Core Concepts

### Session State
At the start of every session, the agent calls `session_start()`. Engram returns the previous task state — what was in progress, key files, decisions made — so the agent resumes instantly instead of re-exploring. The `PreCompact` hook auto-snapshots before every context compaction.

### Memory Types and Confidence
Memories are typed (`convention`, `decision`, `anti_pattern`, `snippet`, `error_pattern`) and scored by confidence (0.0–1.0). Confidence starts at 0.5, rises with validation, decays with time. Only memories above 0.4 confidence are served by default. Memories below 0.2 are auto-archived by `engram gc`.

### Domain Profiles
Engram ships with four domain profiles. Select at init time:

```bash
engram init --domain software   # default: 15 scopes (api, database, testing, ...)
engram init --domain legal      # 6 scopes (litigation, contracts, regulatory, ...)
engram init --domain research   # 7 scopes (methodology, literature, data, ...)
engram init --domain general    # 1 scope (general)
```

Custom profiles can be registered programmatically via the `DomainProfile` interface.

### Convention Enforcement
The `enforce.sh` hook fires before every file write. Engram checks the target file's scope against stored conventions. Violations above 0.8 confidence block the write; lower confidence surfaces as warnings. The agent sees the violation and corrects before writing.

---

## CLI Reference

```bash
# Setup
engram init [--domain <profile>]   # init project, install hooks, inject CLAUDE.md
engram start                        # start MCP server (background)
engram stop                         # stop server
engram status                       # server status, active worktrees, enforcement stats

# Memory
engram memories [--scope] [--type] [--json]
engram invalidate <id>
engram bootstrap                    # analyse codebase, seed memories from patterns
engram gc                           # archive low-confidence memories, prune old snapshots
engram export [--output <path>]     # export knowledge base as JSON
engram import <file> [--replace]    # import from export file

# Observer (auto-extraction sidecar)
engram observer start
engram observer stop
engram observer status

# API keys (for REST API auth)
engram apikey generate              # create key, shown once
engram apikey list
engram apikey revoke <hash>

# Service (macOS global install)
engram service install              # install as launchd service
engram service uninstall
engram service status
```

---

## Roadmap

| Phase | Goal | Status |
|---|---|---|
| 1 — Session State | Agents resume after compaction | ✓ |
| 2 — Project Memory | FTS5 recall, confidence scoring | ✓ |
| 3 — Error Intelligence | Known errors resolve instantly | ✓ |
| 4 — Cross-Worktree Awareness | Parallel agents see each other | ✓ |
| 5 — Convention Enforcement | Violations caught pre-write | ✓ |
| 6 — Domain Profiles + Bootstrap/GC/Export | Any domain, day-one value | ✓ |
| 7 — Full REST API | Any HTTP client, OpenAPI spec | ✓ |
| 8 — Semantic Retrieval | Vector KNN + contradiction detection | In Progress |
| 9 — Auto-Extraction Observer | Passive learning from tool events | ✓ |
| Hardening Sprint | Fix MCP/REST/observer contract gaps | ✓ |
| 10 — TypeScript/Python SDK | Embed in any agent framework | Planned |
| 11 — Cloud Sync + Team Memory | Shared knowledge across team | Planned |
| 12 — Memory Marketplace | Community convention packs | Planned |

---

## Philosophy

Memory is a first-class primitive in agent architecture, not an afterthought. CLAUDE.md files are manually maintained, blunt, and static. Vector stores are the wrong retrieval model for structured project knowledge — you don't want "semantically similar" conventions, you want the exact conventions for this scope, ranked by confidence and recency. Graph databases are infrastructure, not a protocol.

Engram defines the protocol. Structured, typed, scoped, confidence-scored facts with deterministic retrieval. The local SQLite server is the reference implementation. The REST API makes it agent-agnostic. Future implementations — cloud, SDK, third-party — implement the same protocol. Every session builds on the last.
