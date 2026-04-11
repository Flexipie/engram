#!/bin/bash
PORT=$(cat "${CLAUDE_PROJECT_DIR}/.engram/port" 2>/dev/null || echo "7337")
curl -s -X POST "http://localhost:${PORT}/snapshot" \
  -H "Content-Type: application/json" \
  -d "{\"trigger\": \"pre_compact\", \"worktree\": \"$(pwd)\"}" \
  > /dev/null 2>&1
exit 0
