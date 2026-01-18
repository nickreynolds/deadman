#!/bin/bash
set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <iterations>"
  exit 1
fi

for ((i=1; i<=$1; i++)); do
  result=$(docker sandbox run claude --permission-mode acceptEdits -p "@PRD.md @progress.txt \
  1. Find the highest-priority task and implement it. Prioritze the Android app over the iOS app. \
  2. If a task feels too complex, break it down into smaller tasks. \
  3. If you need clarification, update the task with a request for clarification and set the status to NEEDS_CLARIFICATION and output <promise>NEEDS_CLARIFICATION</promise>. \
  3. Run your tests and type checks. \
  4. Update the PRD with what was done. \
  5. Append your progress to progress.txt. \
  6. Commit your changes. \
  ONLY WORK ON A SINGLE TASK. \
  If the PRD is complete, output <promise>COMPLETE</promise>.")

  echo "$result"

  if [[ "$result" == *"<promise>NEEDS_CLARIFICATION</promise>"* ]]; then
    echo "Need clarification after $i iterations."
    exit 0
  fi

  if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
    echo "PRD complete after $i iterations."
    exit 0
  fi
done