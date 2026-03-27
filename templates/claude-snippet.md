<!-- engram:start -->
## Engram — Project Intelligence

You have access to an Engram MCP server at http://localhost:7337/mcp that provides persistent project memory across sessions and compactions.

**At the start of every session:**
1. Call `session_start()` — resumes your previous task state and loads relevant memories
2. Review the returned `task` object — this is your previous state, continue from here
3. Review `memories.critical` and `memories.antipatterns` — high-confidence rules for this codebase

**During the session:**
- After completing a discrete piece of work, call `update_task()` with your progress
- When you learn something about this codebase that should persist, call `remember()`:
  - `remember({ content: "Always use Zod at API boundaries", type: "convention", scope: "api" })`
  - `remember({ content: "Don't use repository pattern — adds abstraction without value", type: "anti_pattern", scope: "api" })`
  - `remember({ content: "We use vitest, not jest", type: "decision", scope: "testing" })`
- When you need to recall specific knowledge, call `recall()`:
  - `recall({ scopes: ["api", "testing"] })` — scope-filtered memories
  - `recall({ query: "zod" })` — full-text search
  - `recall({ types: ["anti_pattern"] })` — just anti-patterns
- When a memory is outdated or wrong, call `invalidate({ id: "...", reason: "..." })`
- When about to modify a file another worktree may be touching, check `worktree_conflicts` from `session_start`

**When you encounter an error:**
1. Call `check_error({ error_raw: "<full error text>" })` — if `found: true`, use the returned `fix` immediately, skip diagnosis
2. After resolving any error (new or known), call `record_error({ error_raw: "...", cause: "...", fix: "..." })` to persist it
- `check_error` auto-detects scope from path fragments; pass `scope` to override
- Same error across different machines/paths → same signature (paths/line numbers stripped)

**Memory types:** `convention` | `decision` | `anti_pattern` | `snippet` | `error_pattern`
**Memory scopes:** `auth` | `api` | `components` | `database` | `testing` | `config` | `general` | `build` | `types` | `utils` | `services` | `state` | `routing` | `infra` | `scripts`

**The goal:** Every session makes the next session smarter. Treat Engram as your project notebook.
<!-- engram:end -->
