#!/usr/bin/env bash
set -euo pipefail

./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint .
node scripts/clean-build-state.cjs
./node_modules/.bin/tsc -p tsconfig.build.json --pretty false --diagnostics
