#!/bin/bash
# PostToolUse hook — sends tool metadata to the observer sidecar
# Reads Claude Code hook JSON from stdin. Never blocks Claude Code (always exits 0).
INPUT=$(cat)

# Extract tool name and file path from hook payload
TOOL=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_name',''))" 2>/dev/null || echo "")
FILE_PATH=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); inp=d.get('tool_input',{}); print(inp.get('file_path', inp.get('path', inp.get('command',''))))" 2>/dev/null || echo "")
EXIT_STATUS=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_response',{}).get('exitCode', 0) if isinstance(d.get('tool_response'), dict) else 0)" 2>/dev/null || echo "0")

# Only proceed if we have a tool name
if [ -z "$TOOL" ]; then
  exit 0
fi

OBS_PORT=$(cat "${CLAUDE_PROJECT_DIR}/.engram/observer-port" 2>/dev/null || echo "7338")

# Post to observer (fire-and-forget, timeout 1s)
curl -s --max-time 1 -X POST "http://localhost:${OBS_PORT}/event" \
  -H "Content-Type: application/json" \
  -d "{\"tool\": \"$TOOL\", \"file_path\": \"$FILE_PATH\", \"exit_status\": $EXIT_STATUS}" \
  > /dev/null 2>&1

# Always exit 0 — never block Claude Code
exit 0
