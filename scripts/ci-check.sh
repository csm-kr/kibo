#!/bin/sh
# The checks cloudbuild.yaml runs before it builds an image, so a person can run the same gate locally first.
# Lint, unit tests, a production build, then the forged-command check against that build (scripts/attack-check.ts:
# a local server with the memory store, never a deployed URL, no AI calls). Installing (npm ci) is left to the
# caller: Cloud Build starts from a clean clone, and wiping a developer's node_modules is not a check.
# The last line is CI PASSED or CI FAILED: <step>.
set -u

cd "$(dirname "$0")/.."

step() {
  echo "== $1"
  shift
  "$@" || {
    echo "CI FAILED: $*"
    exit 1
  }
}

step "lint" npm run lint
step "unit tests" npm run test
step "production build" npm run build
step "forged commands" npm run check:attacks
echo "CI PASSED"
