#!/bin/bash
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
if [ "$TOOL_NAME" = "Write" ]; then
  FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
  if [ -n "$FILE_PATH" ]; then
    WORKTREE=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
    RESULT=$(curl -s -X POST http://localhost:7337/enforce \
      -H "Content-Type: application/json" \
      -d "{\"file_path\": \"$FILE_PATH\", \"worktree\": \"$WORKTREE\"}" \
      --max-time 2)
    WARNINGS=$(echo "$RESULT" | jq -r '.warnings // [] | length')
    if [ "$WARNINGS" -gt 0 ] 2>/dev/null; then
      echo "$RESULT" | jq -r '.warnings[] | "ENGRAM WARNING: " + .' >&2
    fi
    VIOLATIONS=$(echo "$RESULT" | jq -r '.violations // [] | length')
    if [ "$VIOLATIONS" -gt 0 ] 2>/dev/null; then
      echo "$RESULT" | jq -r '.violations[] | "ENGRAM VIOLATION: " + .' >&2
    fi
  fi
fi
exit 0
