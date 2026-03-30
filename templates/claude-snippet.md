<!-- engram:start -->
## Engram — Convention Memory Layer

You have access to an Engram MCP server at http://localhost:7337/mcp. Engram is your persistent memory across sessions — it survives compaction, restarts, and agent handoffs.

**At the start of every session:**
1. Call `session_start()` — loads your previous task state and relevant memories
2. Review `task` — your previous state, continue from here
3. Review `memories.critical` and `memories.antipatterns` — high-confidence rules for this project

**During the session:**
- After completing a discrete piece of work → `update_task()` with your progress
- When you learn something that should persist → `remember()`:
  - `remember({ content: "...", type: "convention", scope: "..." })`
  - `remember({ content: "...", type: "anti_pattern", scope: "..." })`
  - `remember({ content: "...", type: "decision", scope: "..." })`
- When you need to recall knowledge → `recall()`:
  - `recall({ scopes: ["api"] })` — scope-filtered
  - `recall({ query: "zod" })` — full-text search
  - `recall({ types: ["anti_pattern"] })` — just anti-patterns
- When a memory is wrong or outdated → `invalidate({ id: "...", reason: "..." })`

**Before writing a file:**
- `check_conventions({ file_path: "src/api/handler.ts" })` — returns `{ violations[], warnings[] }`
  - If `violations` is non-empty → fix the issues before writing (conventions are being enforced)
  - If `warnings` is non-empty → review before proceeding (informational)

**When you encounter an error:**
1. `check_error({ error_raw: "<full error text>" })` — if `found: true`, use the returned `fix` immediately
2. After resolving → `record_error({ error_raw: "...", cause: "...", fix: "..." })`

**Memory types:** `convention` | `decision` | `anti_pattern` | `snippet` | `error_pattern`
**Memory scopes:** `auth` | `api` | `components` | `database` | `testing` | `config` | `general` | `build` | `types` | `utils` | `services` | `state` | `routing` | `infra` | `scripts`

**The goal:** Every session makes the next session smarter.
<!-- engram:end -->
