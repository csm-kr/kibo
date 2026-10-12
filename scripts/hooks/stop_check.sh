#!/bin/sh
# Stop hook: during harness runs only (HARNESS_RUN=1, set by scripts/execute.py), require
# lint, build and test to pass before a step session may end. Exit 2 sends the failure
# back to Claude so it keeps fixing instead of stopping. Interactive sessions skip this.
[ "$HARNESS_RUN" = "1" ] || exit 0
[ -f package.json ] || exit 0
out=$(npm run lint 2>&1 && npm run build 2>&1 && npm run test 2>&1)
status=$?
if [ $status -ne 0 ]; then
  printf '%s\n' "$out" | tail -40 >&2
  exit 2
fi
exit 0
