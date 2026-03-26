#!/bin/bash
curl -s -X POST http://localhost:7337/snapshot \
  -H "Content-Type: application/json" \
  -d "{\"trigger\": \"pre_compact\", \"worktree\": \"$(pwd)\"}" \
  > /dev/null 2>&1
exit 0
