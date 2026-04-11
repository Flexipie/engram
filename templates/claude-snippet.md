<!-- engram:start -->
## Engram — Convention Memory Layer

You have access to an Engram MCP server at http://localhost:7337/mcp. Persistent memory across sessions — survives compaction, restarts, and agent handoffs.

**Session start (required):**
1. `session_start()` — returns your previous task + relevant memories
2. Check `memories.critical` and `memories.antipatterns` before doing anything
3. If `worktree_conflicts` is non-empty, check which files are shared before touching them

**Errors (do this first — before any debugging):**
1. `check_error({ error_raw: "<full error>" })` — if `found: true`, use `fix` immediately, skip diagnosis
2. After fixing → `record_error({ error_raw: "...", cause: "...", fix: "..." })`

**Before writing a file:**
- `check_conventions({ file_path: "..." })` — if `violations` non-empty, fix before writing

**During the session:**
- Completed work or decisions → `update_task({ summary, completed, next_steps, ... })`
- Something that should persist → `remember({ content, type, scope })`
  - `type`: `convention` | `anti_pattern` | `decision` | `snippet`
  - `scope`: `api` | `database` | `testing` | `auth` | `components` | `config` | `utils` | `services` | `types` | `state` | `routing` | `scripts` | `build` | `infra` | `general`
  - Use `source: "manual"` for high-confidence rules (confidence 0.8 vs 0.5)
- Need to recall something → `recall({ query?, scopes?, types? })` — global memories included by default
- Don't know what memories exist → `browse_memories({ scope?, type? })` — flat list, no query needed
- Memory is wrong → `invalidate({ id, reason })`

**The goal:** Every session makes the next session smarter.
<!-- engram:end -->
