#!/usr/bin/env bash
set -euo pipefail

# Read hook input from stdin
INPUT=$(cat)

# Extract the file path from the tool input
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Skip if no file path or not a TS/TSX file
if [[ -z "$FILE_PATH" ]] || [[ ! "$FILE_PATH" =~ \.(ts|tsx)$ ]]; then
  exit 0
fi

# Skip if file doesn't exist (was deleted)
if [[ ! -f "$FILE_PATH" ]]; then
  exit 0
fi

# Step 1: Run eslint --fix on the changed file
ESLINT_OUTPUT=$(npx eslint --fix "$FILE_PATH" 2>&1) || {
  echo "ESLint errors in $FILE_PATH:" >&2
  echo "$ESLINT_OUTPUT" >&2
  exit 2
}

# Step 2: Run tsc --noEmit on the containing package (only if eslint passed)
# Derive the package directory from the file path (monorepo: packages/<name>/)
PACKAGE_DIR=$(echo "$FILE_PATH" | sed -n 's|\(.*packages/[^/]*\)/.*|\1|p')
if [[ -n "$PACKAGE_DIR" ]] && [[ -f "$PACKAGE_DIR/tsconfig.json" ]]; then
  TSC_OUTPUT=$(npx tsc --noEmit -p "$PACKAGE_DIR/tsconfig.json" 2>&1) || {
    echo "TypeScript errors:" >&2
    echo "$TSC_OUTPUT" >&2
    exit 2
  }
fi

exit 0
