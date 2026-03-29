<!-- engram:start -->
## Engram — Project Intelligence

You have access to an Engram MCP server at http://localhost:7337/mcp that provides persistent project memory across sessions and compactions.

**At the start of every session:**
1. Call `session_start()` — resumes your previous task state if it exists, loads relevant memories
2. Review the returned `task` object — this is your previous state, continue from here

**During the session:**
- After completing a discrete piece of work, call `update_task()` with your progress
- When you learn something about this codebase that should persist, call `remember()`
- When you encounter a build error or test failure, call `check_error()` BEFORE diagnosing
- After resolving an error, call `record_error()` with the cause and fix
- When about to modify a file another worktree may be touching, call `get_worktree_status()` first

**The goal:** Every session makes the next session smarter. Treat Engram as your project notebook.
<!-- engram:end -->




