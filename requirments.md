# Engram — Product Requirements Document
### Version 1.0 | Project Intelligence Layer for AI Coding Agents

---

## 1. Vision

Engram is a universal agent memory architecture. Any agent — Claude Code, Cursor, LangGraph, AutoGen, a custom HTTP client — can call Engram to persist what it learns and recall what came before, so every session builds on the last.

The goal is not to patch around limitations of existing tools. It is to build the infrastructure layer that sits underneath every agent session — the persistent nervous system that makes every agent interaction smarter than the last, regardless of which tool, domain, or team you're working with.

The stack: local MCP + REST today → TypeScript/Python SDK → cloud sync → memory marketplace.

**One sentence:** Engram is the memory protocol that turns any AI agent from a smart stranger into a domain expert that knows your project, your team, and your conventions.

---

## 2. The Problems

### Problem 1 — Session Amnesia (Acute, Daily Pain)

Every Claude Code compaction, every new session, every worktree switch starts from zero. The agent re-explores files it has already read, re-asks questions you've already answered, re-debates architectural decisions that were settled weeks ago. On a complex project, the re-orientation tax is 20–30 minutes per session.

When Claude Code compacts mid-session, the entire working context is summarised and discarded. The agent loses its exploration map, its in-progress state, its discovered constraints, and the decisions made earlier in the run. The developer has to reconstruct the context manually.

This is not a minor inconvenience. It is a fundamental break in the human-agent collaboration loop.

### Problem 2 — The Agent Never Learns Your Project (Chronic, Compounding)

Every session, the agent is equally ignorant of how you work. It does not know you always use Zod at API boundaries. It does not know you have rejected the repository pattern three times. It does not know your test file conventions, your error handling style, or the specific architectural decisions that make your codebase coherent.

You correct it. It adapts within the session. It forgets completely. You correct it again the next session. This is a loop with no exit.

### Problem 3 — Errors Are Re-Diagnosed From Scratch Every Time

When a build fails or a test breaks, the agent diagnoses it fresh. But most errors in a given project are recurring — the same TypeScript quirk, the same environment issue, the same test setup problem. There is no memory of what caused that error last time, or what fixed it. Every diagnosis starts from first principles.

### Problem 4 — Parallel Agents Work in Isolation

When multiple worktrees are active — a feature branch, a bugfix, a refactor — the agents working in each have no awareness of what the others are doing. Two agents can make conflicting decisions about the same module without either knowing. There is no coordination layer, not even passive awareness.

---

## 3. Current Landscape — Why Nothing Solves This

### CLAUDE.md / .cursorrules / project rules
The incumbent. A manually written markdown file loaded at session start.

**Why it fails:** Entirely manual — you must know what to write and remember to update it. Blunt — loads fully every session regardless of relevance. Static — does not learn from corrections or grow over time. Does not capture living session state. Goes stale the moment your codebase evolves.

### Memory MCP servers (mem0, Basic Memory, others)
Store and retrieve unstructured text snippets via semantic search.

**Why they fail:** Unstructured text blobs with no understanding of knowledge type. The agent must call `remember` explicitly and often does not. No codebase awareness — they store conversation notes, not project intelligence. Start empty, require manual population. Retrieval via semantic search is imprecise for structured project knowledge. Not project-scoped — account-level, not repository-level.

### Graph databases (Neo4j) and vector stores
Infrastructure primitives, not memory protocols. They are also the wrong retrieval model for structured project knowledge. A convention like "always use Zod at API boundaries" should be retrieved by scope and type, not by vector similarity to an arbitrary query string. Vector search is an enhancement on top of structured retrieval — not a replacement for it. Engram adds optional semantic retrieval (Phase 8) as a layer on top of its FTS5 foundation.

### Cursor codebase indexing
Semantic search over your codebase. "Find where auth is handled."

**Why it fails:** Answers "where is X" not "how do we do X in this project." Does not capture decisions, conventions, or rationale. Does not persist session state. Read-only — the agent cannot write to it.

### Anthropic's native memory (in progress)
Anthropic is building memory functions into Claude. Based on current behaviour, it is not project-scoped, not structured, not codebase-aware, and not mature enough to rely on.

**The gap:** Nobody has built a system that automatically extracts structured project intelligence from the codebase itself, captures the living state of an active session so it survives compaction, learns from the delta between what AI generates and what you actually commit, and serves all of this selectively based on what is relevant right now.

---

## 4. What Engram Is

Engram is a local MCP server with three layers:

**Layer 1 — Session State.** A living ledger of what you are currently building. Survives compaction and session restarts. Per-worktree. The agent reads it at session start and resumes instead of re-exploring.

**Layer 2 — Project Intelligence.** A structured knowledge base about how your project works. Grows organically as the agent works, accelerated by explicit corrections. Conventions, decisions, error patterns — all stored and queryable with structured precision.

**Layer 3 — Cross-Worktree Awareness.** Passive visibility into what other agents are doing in parallel worktrees. File-level conflict detection. Not coordination — awareness.

Everything runs locally. A single SQLite file per project. No cloud. No code leaves the machine. Zero infrastructure to manage.

---

## 5. Database Design

### Core Principle
Structured, relational, deterministic. Not vectors, not embeddings, not semantic search as the primary mechanism. The agent asks a precise question and gets a precise answer. This makes the system debuggable, fast, and consistent.

### Schema

```sql
-- ============================================================
-- LAYER 1: SESSION STATE
-- ============================================================

CREATE TABLE tasks (
  id          TEXT PRIMARY KEY,          -- uuid
  worktree    TEXT NOT NULL,             -- absolute path of worktree
  title       TEXT NOT NULL,             -- short human label
  goal        TEXT NOT NULL,             -- what are we trying to accomplish
  status      TEXT DEFAULT 'active',     -- active | paused | archived
  started_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  archived_at TEXT
);

CREATE TABLE task_state (
  id                 TEXT PRIMARY KEY,
  task_id            TEXT NOT NULL REFERENCES tasks(id),
  summary            TEXT,              -- running plain-english summary, agent updates periodically
  completed          TEXT DEFAULT '[]', -- JSON array of completed work items
  in_progress        TEXT,              -- what is actively being worked on right now
  next_steps         TEXT DEFAULT '[]', -- JSON array
  key_files          TEXT DEFAULT '[]', -- JSON: file paths that matter for this task
  constraints        TEXT DEFAULT '[]', -- JSON: discovered constraints ("don't touch X")
  decisions          TEXT DEFAULT '[]', -- JSON: decisions made this session with rationale
  updated_at         TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE TABLE snapshots (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL REFERENCES tasks(id),
  state_json  TEXT NOT NULL,             -- full serialised task_state at this moment
  trigger     TEXT NOT NULL,             -- pre_compact | session_end | manual | checkpoint
  created_at  TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

-- ============================================================
-- LAYER 2: PROJECT INTELLIGENCE
-- ============================================================

CREATE TABLE memories (
  id             TEXT PRIMARY KEY,
  type           TEXT NOT NULL,      -- convention | decision | error_pattern | anti_pattern | snippet
  scope          TEXT NOT NULL,      -- auth | api | testing | components | database | config | general
  content        TEXT NOT NULL,      -- the knowledge itself, plain english
  confidence     REAL DEFAULT 0.5,   -- 0.0–1.0, decays over time, boosted by corrections
  source         TEXT NOT NULL,      -- agent | correction | manual
  evidence_count INTEGER DEFAULT 1,  -- how many times this has been validated
  invalidated    INTEGER DEFAULT 0,  -- soft delete flag
  invalidation_reason TEXT,
  last_validated TEXT,               -- last time a correction confirmed this
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE TABLE corrections (
  id              TEXT PRIMARY KEY,
  scope           TEXT NOT NULL,
  before_snippet  TEXT NOT NULL,     -- what the agent generated
  after_snippet   TEXT NOT NULL,     -- what you actually kept
  reason          TEXT,              -- optional: why the correction was made
  memory_id       TEXT,              -- FK if this correction promoted to a memory
  session_id      TEXT,              -- which task/session this came from
  promoted        INTEGER DEFAULT 0,
  created_at      TEXT NOT NULL,
  FOREIGN KEY (memory_id) REFERENCES memories(id)
);

CREATE TABLE error_patterns (
  id              TEXT PRIMARY KEY,
  signature       TEXT NOT NULL UNIQUE, -- normalised error string used for matching
  error_raw       TEXT NOT NULL,        -- the actual error as seen
  cause           TEXT,                 -- what caused it
  fix             TEXT NOT NULL,        -- what resolved it
  recurrence      INTEGER DEFAULT 1,    -- how many times this has been seen
  scope           TEXT,
  last_seen       TEXT NOT NULL,
  created_at      TEXT NOT NULL
);

-- ============================================================
-- LAYER 3: CROSS-WORKTREE AWARENESS
-- ============================================================

CREATE TABLE worktree_activity (
  worktree        TEXT PRIMARY KEY,  -- absolute path
  task_id         TEXT,              -- currently active task
  active_files    TEXT DEFAULT '[]', -- JSON: files being actively read/written
  last_heartbeat  TEXT NOT NULL      -- updated every few minutes while session is live
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_memories_scope    ON memories(scope);
CREATE INDEX idx_memories_type     ON memories(type);
CREATE INDEX idx_memories_conf     ON memories(confidence DESC);
CREATE INDEX idx_memories_valid    ON memories(invalidated);
CREATE INDEX idx_tasks_worktree    ON tasks(worktree);
CREATE INDEX idx_tasks_status      ON tasks(status);
CREATE INDEX idx_errors_signature  ON error_patterns(signature);
CREATE INDEX idx_corrections_scope ON corrections(scope);
```

### Why This Schema

- **memories is the single source of truth for knowledge.** Conventions, decisions, anti-patterns, and snippets are all the same shape with a `type` discriminator. This keeps the query surface small.
- **corrections feed memories but are kept separate.** Raw corrections are noisy. Promoted corrections become memories. The separation lets you inspect the raw signal without polluting the knowledge base.
- **error_patterns is a dedicated table.** Errors have a distinct shape — signature-based lookup, recurrence tracking — that doesn't fit cleanly in memories. Dedicated table means dedicated tooling.
- **soft deletes everywhere.** Nothing is hard deleted. `invalidated = 1` plus `invalidation_reason` gives you a full audit trail and lets you undo mistakes.

---

## 6. MCP Tool Surface

Nine agent-facing tools. Simple enough that any agent can hold the entire API in working memory.

```typescript
// ── MEMORY TOOLS ──────────────────────────────────────────

remember({
  content: string,   // the thing to store
  type: MemoryType,  // convention | decision | error_pattern | anti_pattern | snippet
  scope: string,     // auth | api | testing | components | database | config | general
  source?: string    // defaults to 'agent'
}): { id: string }

// Write a new memory. Called when the agent learns something worth preserving.
// Examples:
//   remember({ content: "Always use Zod schemas at tRPC procedure boundaries, not just at API edge", type: "convention", scope: "api" })
//   remember({ content: "Decided against repository pattern — adds abstraction without value in this codebase", type: "decision", scope: "database" })


recall({
  scope?: string,    // filter by scope
  type?: MemoryType, // filter by type
  query?: string     // optional free-text filter over content (SQLite FTS)
}): Memory[]

// Read relevant memories. Returns top results ordered by confidence.
// Called at session start and when entering a new area of the codebase.
// Example:
//   recall({ scope: "auth" }) → returns all auth conventions + decisions, ordered by confidence


invalidate({
  id: string,
  reason: string
}): { ok: boolean }

// Mark a memory as stale. Soft delete — audit trail preserved.
// Called when a convention is explicitly overridden or a decision is reversed.


// ── SESSION TOOLS ─────────────────────────────────────────

update_task({
  worktree?: string,          // defaults to cwd
  title?: string,
  goal?: string,
  summary?: string,
  completed?: string[],
  in_progress?: string,
  next_steps?: string[],
  key_files?: string[],
  constraints?: string[],
  decisions?: Array<{ decision: string, rationale: string }>
}): { task_id: string }

// Create or update the active task for this worktree.
// Partial updates — only fields provided are changed.
// Called at session start (create), after completing work (update), before compact (full update).


get_task({
  worktree?: string   // defaults to cwd
}): Task | null

// Read the active task state for this worktree.
// Returns null if no active task exists.
// Called at the very start of every session, before doing anything else.


// ── ERROR TOOLS ───────────────────────────────────────────

log_error({
  error_raw: string,   // the full error output
  cause?: string,      // what caused it (filled in after diagnosis)
  fix?: string,        // what fixed it (filled in after resolution)
  scope?: string
}): { id: string, existing?: ErrorPattern }

// Log an error. If a matching signature already exists, returns the existing record
// with the known fix. The agent should check this BEFORE diagnosing from scratch.
// Two-phase: call with just error_raw first (check for existing fix),
// then call again with cause + fix after resolving.


// ── WORKTREE TOOLS ────────────────────────────────────────

get_worktree_status(): WorktreeStatus[]

// Returns all active worktrees, their current tasks, and which files they are touching.
// Called when about to modify a file — check for conflicts first.
```

### Convention Enforcement — How It Actually Works

You asked the right question: the MCP server cannot intercept an agent's thoughts before it writes a file. But it can intercept the *write* via Claude Code hooks.

Claude Code's hook system fires `pre_tool_call` before any tool executes. Before a `write_file` call, the hook fires. The hook calls Engram's enforcement endpoint (not an MCP tool — an internal HTTP endpoint the hook scripts against):

```bash
# .claude/hooks/pre_tool_call.sh
# Fires before every tool call

if [ "$TOOL_NAME" = "Write" ]; then
  RESULT=$(curl -s -X POST http://localhost:7337/enforce \
    -H "Content-Type: application/json" \
    -d "{\"file\": \"$FILE_PATH\", \"content\": \"$CONTENT\"}")
  
  VIOLATIONS=$(echo $RESULT | jq '.violations')
  
  if [ "$VIOLATIONS" != "null" ] && [ "$VIOLATIONS" != "[]" ]; then
    echo "ENGRAM: Convention violations detected:"
    echo $VIOLATIONS | jq -r '.[] | "  - " + .'
    # Return non-zero to block the write and surface violations to the agent
    exit 1
  fi
fi
```

The `/enforce` endpoint checks the incoming file content against stored conventions for the relevant scope. It does not block all writes — only writes that violate conventions with confidence above 0.8. Lower-confidence conventions surface as warnings, not blocks.

This is achievable for Claude Code. For Cursor and other tools that don't expose pre-write hooks, enforcement degrades gracefully to recall — the agent checks conventions before writing rather than being blocked from writing. The hook approach is a Claude Code specific enhancement, not a requirement.

---

## 7. Integration Design

### Claude Code — Full Integration

**CLAUDE.md additions (added by `engram init`):**

```markdown
## Engram — Project Intelligence

You have access to an Engram MCP server that provides persistent project memory.

**At the start of every session:**
1. Call `get_task()` — resume your previous state if it exists, create a new task if it doesn't
2. Call `recall({ scope: <primary scope of your work> })` — load relevant conventions

**During the session:**
- After completing a discrete piece of work, call `update_task()` with your progress
- When you learn something about this codebase that should persist, call `remember()`
- When you encounter a build error or test failure, call `log_error()` BEFORE diagnosing — the fix may already be known
- When I correct your code and the reason is generalizable, call `remember()` with type "correction"
- When you are about to modify a file that another worktree may be touching, call `get_worktree_status()` first

**Invalidation:**
- If I tell you a convention is outdated or a decision has changed, call `invalidate()` with the reason

The goal is for this session's work to make the next session smarter. Treat Engram as your project notebook.
```

**Hooks (added by `engram init`):**

```json
// .claude/settings.json additions
{
  "hooks": {
    "PreToolCall": [
      {
        "matcher": "Write",
        "hooks": [{ "type": "command", "command": "engram enforce --file $FILE_PATH --content $CONTENT" }]
      }
    ],
    "PreCompact": [
      {
        "hooks": [{ "type": "command", "command": "engram snapshot --trigger pre_compact" }]
      }
    ]
  }
}
```

The `PreCompact` hook is the most important. It fires automatically before every compaction, takes a full task state snapshot, and stores it. Post-compaction, the agent reads `get_task()` and resumes from the snapshot.

### Cursor / Windsurf

No hooks available. Integration via `.cursorrules` or project rules:

```
You have access to Engram MCP tools for project memory.
Start every session with get_task() and recall(). 
Update task state after completing work.
Log errors before diagnosing them.
```

Softer integration but still useful — session state and memory recall work. Enforcement and auto-snapshot don't. Future: investigate Cursor's extension API for deeper hooks.

### Any MCP-Compatible Tool

The five tools work in any tool that supports MCP. The quality of integration depends on how well the tool follows system prompt instructions and whether it exposes hooks.

---

## 8. CLI Design

The CLI manages the server and gives you direct visibility into the knowledge base.

```bash
# Setup
engram init              # initialise .engram/ in current project, add to .claude/settings.json
engram start             # start the MCP server (background process)
engram stop              # stop the server
engram status            # show server status, active tasks, memory count

# Memory management
engram memories                           # list all memories, grouped by scope
engram memories --scope auth              # filter by scope
engram memories --type convention         # filter by type
engram invalidate <id>                    # mark a memory stale (prompts for reason)
engram corrections                        # list raw corrections not yet promoted

# Session management  
engram task                               # show active task for current worktree
engram task --all                         # show all active tasks across all worktrees
engram snapshots                          # list snapshots for current task
engram snapshots --restore <id>           # manually restore from a snapshot

# Error patterns
engram errors                             # list all known error patterns
engram errors --scope testing             # filter by scope

# Maintenance
engram gc                                 # garbage collect: prune stale memories, old snapshots, archived tasks
engram export                             # export full knowledge base as JSON (backup / share)
```

---

## 9. Confidence and Decay System

Memories are not permanent truths. They are beliefs with confidence levels. The system must handle the natural evolution of a codebase.

### Confidence Scoring

| Event | Confidence Effect |
|---|---|
| Memory created by agent | 0.5 (default) |
| Memory created with explicit `source: "manual"` | 0.8 |
| Each correction that validates the memory | +0.1 (max 1.0) |
| Each correction that contradicts the memory | -0.2 |
| 30 days without validation | ×0.95 decay |
| 90 days without validation | Flagged as stale |
| Confidence drops below 0.2 | Auto-archived |

### Serving Threshold

`recall()` only returns memories with confidence above 0.4 by default. Memories between 0.2–0.4 exist but are not served unless explicitly queried. This keeps the agent's context clean.

### Garbage Collection (`engram gc`)

Runs manually or on a schedule. Actions:
- Archive memories with confidence < 0.2
- Prune corrections older than 6 months that were never promoted
- Prune snapshots older than 30 days (keep only the last 3 per task)
- Archive tasks with status `paused` for more than 60 days
- Log all actions taken to `.engram/gc.log`

---

## 10. Worktree & Multi-Agent Awareness

Each task is scoped to a `worktree` path. The MCP server handles all worktrees from a single running instance at the project root.

### Conflict Detection Flow

```
Agent in worktree-2 is about to modify src/lib/auth/session.ts
Agent calls get_worktree_status()
Server returns:
  worktree-1 (feature/checkout):
    task: "implementing checkout flow"
    active_files: ["src/lib/auth/session.ts", "src/lib/cart/index.ts"]
  worktree-3 (bugfix/auth-timeout):
    task: "fixing session timeout bug"  
    active_files: ["src/lib/auth/session.ts", "src/lib/auth/types.ts"]

Agent sees that two other worktrees are actively touching the same file.
Agent surfaces this: "Note: worktree-1 and worktree-3 are both modifying session.ts.
You may want to coordinate before making changes here."
```

Heartbeats: each active session updates `worktree_activity.last_heartbeat` every 2 minutes via a background hook. Sessions that haven't heartbeated in 10 minutes are considered inactive and excluded from conflict detection.

### Shared Memory

Project intelligence memories are shared across all worktrees — they belong to the project, not the session. Session state is worktree-scoped. This is the right separation: conventions are global, task progress is local.

---

## 11. What Engram Does Not Do

Being explicit about scope boundaries matters.

- **Does not store your code.** Only metadata: conventions, decisions, error signatures, task descriptions. Never file contents.
- **Does not call external APIs in base config.** Fully local by default. The optional observer sidecar (Phase 9) can call a local Ollama instance or the Anthropic API for automatic memory extraction — both require explicit opt-in configuration.
- **Does not coordinate agents.** Cross-worktree awareness is read-only. Agents see what others are doing. They do not send messages to each other or block each other's work.
- **Does not replace CLAUDE.md.** It augments it. The CLAUDE.md instructions tell the agent to use Engram. Engram then provides the dynamic content that the CLAUDE.md cannot.
- **Does not work without agent cooperation.** The system improves with use. A session where the agent never calls Engram tools adds no value. The hooks and CLAUDE.md instructions are designed to maximise cooperation, but they are not foolproof.

---

## 12. Phase Roadmap

| Phase | Goal | Status |
|---|---|---|
| 1 — Session State | Solve compaction. Agents resume after context reset. | ✓ Done |
| 2 — Project Memory | Agent stops making same mistakes. FTS5 recall, confidence scoring. | ✓ Done |
| 3 — Error Intelligence | Known errors resolve instantly. Signature-based lookup. | ✓ Done |
| 4 — Cross-Worktree Awareness | Parallel agents are visible to each other. | ✓ Done |
| 5 — Convention Enforcement | Violations caught before write via hook interception. | ✓ Done |
| 6 — Dynamic Scopes + Domain Profiles + Bootstrap/GC/Export | Break software-only coupling. Any domain can use Engram. | ✓ Done |
| 7 — Full REST API | Any HTTP client can use Engram without MCP. | ✓ Done |
| 8 — Semantic Retrieval | Find memories by meaning. Vector KNN + contradiction detection. | Planned |
| 9 — Auto-Extraction Observer | Engram learns passively from tool events via local LLM. | ✓ Done |
| 10 — TypeScript/Python SDK | Embed Engram in any agent framework with 3 lines of code. | Planned |
| 11 — Cloud Sync + Team Memory | Shared knowledge base across team members and machines. | Planned |
| 12 — Memory Marketplace | Community-sourced convention packs. Bootstrap any project instantly. | Planned |

---

## 13. Technical Stack

| Component | Choice | Reason |
|---|---|---|
| Runtime | Node.js + TypeScript | MCP SDK is Node-native, your existing stack |
| Database | SQLite via `better-sqlite3` | Local-first, zero infrastructure, synchronous API fits MCP's request-response model |
| MCP SDK | `@modelcontextprotocol/sdk` | Official SDK |
| AST analysis | `ts-morph` | Best TypeScript AST library, used in Phase 6 only |
| Git integration | `simple-git` | Used for correction capture in future phases |
| CLI framework | `commander` + `chalk` | Standard, lightweight |
| Process management | Background Node process | Simple, no daemon complexity |

### Server Architecture

```
engram start
└── HTTP server on localhost:7337
    ├── /mcp          — MCP protocol endpoint (SSE transport)
    ├── /enforce      — Convention enforcement (called by hooks)
    ├── /heartbeat    — Worktree activity ping (called by hooks)
    └── /health       — Status check
```

Single port, single process. The MCP tools and the hook endpoints share the same SQLite connection. No concurrency issues because `better-sqlite3` is synchronous.

---

## 14. File Structure

```
engram/
├── src/
│   ├── server.ts          — HTTP server entry point
│   ├── mcp/
│   │   ├── tools.ts       — MCP tool definitions (remember, recall, etc.)
│   │   └── handlers.ts    — Tool handler implementations
│   ├── db/
│   │   ├── connection.ts  — SQLite connection and migrations
│   │   ├── memories.ts    — Memory CRUD operations
│   │   ├── tasks.ts       — Task/session CRUD operations
│   │   ├── errors.ts      — Error pattern operations
│   │   └── worktrees.ts   — Worktree activity tracking
│   ├── enforcement/
│   │   └── checker.ts     — Convention enforcement logic
│   ├── cli/
│   │   ├── index.ts       — CLI entry point (commander)
│   │   └── commands/      — One file per CLI command
│   └── hooks/             — Shell hook scripts (copied by engram init)
│       ├── pre_compact.sh
│       └── pre_tool_call.sh
├── package.json
├── tsconfig.json
└── README.md
```

---

## 15. Success Metrics

### Personal (Dogfooding)
- Time-to-productive in a session after compaction: target < 2 minutes (from current 20–30)
- Agent re-asking questions already answered: target zero
- Recurring corrections on the same mistake: target zero after 3 corrections
- Recurring error re-diagnosis time: target < 10 seconds for known errors

### If Released Publicly
- Weekly active users running `engram start`
- Memory retention rate (memories that survive > 30 days = useful memories)
- Compaction survival rate (% of compactions where agent correctly resumes)
- Correction promotion rate (% of corrections that become memories)

---

## 16. Open Questions

**1. How does the agent know to call `log_error` proactively?**
The CLAUDE.md instruction says "before diagnosing any error, call `log_error` first." But the agent needs to recognise that an error has occurred. For Claude Code this is natural — tool call failures and bash errors are surfaced as distinct events. The instruction should be specific: "whenever a bash command exits non-zero or a type check fails, call `log_error` before attempting diagnosis."

**2. What is the right granularity for task updates?**
Too frequent: adds noise and token cost. Too infrequent: state is stale when compaction hits. Current thinking: update after every discrete work item (completing a function, finishing a file, resolving a specific problem). Not after every tool call.

**3. Should memories ever be automatically promoted from corrections?**
Current design: manual. The agent calls `remember()` when it decides something is worth preserving. Future enhancement: automatic promotion when 3+ corrections cluster around the same pattern. Phase 2 ships manual only; auto-promotion is a Phase 3 enhancement.

**4. Cloud sync for paid tier?**
Out of scope for Phase 1–5. If Engram gains traction, cloud sync across machines (same project, different computers) is the natural paid feature. All Phase 1 architecture decisions should be compatible with an eventual sync layer — but do not design for it now.