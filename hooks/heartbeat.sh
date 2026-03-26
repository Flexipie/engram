#!/bin/bash
# Read stdin (Claude Code hook format)
INPUT=$(cat)
WORKTREE=$(pwd)
# Throttle: only send every 10 calls
COUNTER_FILE="${ENGRAM_DIR:-.engram}/heartbeat_counter"
COUNT=$(cat "$COUNTER_FILE" 2>/dev/null || echo "0")
COUNT=$((COUNT + 1))
echo "$COUNT" > "$COUNTER_FILE"
if [ $((COUNT % 10)) -eq 0 ]; then
  curl -s -X POST http://localhost:7337/heartbeat \
    -H "Content-Type: application/json" \
    -d "{\"worktree\": \"$WORKTREE\"}" \
    > /dev/null 2>&1
fi
exit 0
