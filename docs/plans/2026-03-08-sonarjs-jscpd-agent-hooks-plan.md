# SonarJS, jscpd, and Agent Hooks Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add eslint-plugin-sonarjs and jscpd to enforce code quality guardrails, and wire linting into the agentic workflow via a Claude Code PostToolUse hook.

**Architecture:** eslint-plugin-sonarjs is added to the existing ESLint flat config. jscpd runs as a standalone pre-commit check. A PostToolUse hook script runs eslint --fix (per-file) then tsc --noEmit (full project) after every Edit/Write, blocking the agent on failure.

**Tech Stack:** eslint-plugin-sonarjs, jscpd, Claude Code hooks (PostToolUse), shell scripting

**Prerequisites:** This work builds on the `feat/eslint-prettier` branch. Merge or rebase that branch first.

---

### Task 1: Install eslint-plugin-sonarjs

**Files:**
- Modify: `package.json` (root devDependencies)

**Step 1: Install the package**

Run:
```bash
npm install --save-dev eslint-plugin-sonarjs
```

**Step 2: Verify installation**

Run:
```bash
node -e "require('eslint-plugin-sonarjs')" && echo "OK"
```
Expected: `OK`

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install eslint-plugin-sonarjs"
```

---

### Task 2: Add sonarjs to ESLint config

**Files:**
- Modify: `eslint.config.js`

**Step 1: Add sonarjs import and recommended config**

Add the import at the top of `eslint.config.js`:

```js
import sonarjs from 'eslint-plugin-sonarjs';
```

Add `sonarjs.configs.recommended` to the config array, after `unicorn.configs['flat/recommended']` and before the parser options block:

```js
  unicorn.configs['flat/recommended'],
  sonarjs.configs.recommended,
```

**Step 2: Run ESLint to check for new violations**

Run:
```bash
npx eslint . 2>&1 | head -100
```

Review the output. If there are sonarjs violations, assess them:
- If they're legitimate issues, fix them
- If a specific rule is too noisy for the codebase, disable it in the config's `rules` block

**Step 3: Fix all sonarjs violations**

Fix each violation. Common sonarjs rules that may fire:
- `sonarjs/cognitive-complexity` — refactor complex functions
- `sonarjs/no-duplicate-string` — extract repeated strings to constants
- `sonarjs/no-identical-functions` — deduplicate identical functions

**Step 4: Verify clean lint**

Run:
```bash
npx eslint .
```
Expected: No errors

**Step 5: Verify tests still pass**

Run:
```bash
npm run test
```
Expected: All tests pass

**Step 6: Verify build is clean**

Run:
```bash
npm run build
```
Expected: No TypeScript errors

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: add eslint-plugin-sonarjs with recommended rules"
```

---

### Task 3: Install and configure jscpd

**Files:**
- Modify: `package.json` (root devDependencies + scripts)
- Create: `.jscpd.json`

**Step 1: Install jscpd**

Run:
```bash
npm install --save-dev jscpd
```

**Step 2: Create jscpd config**

Create `.jscpd.json` at project root:

```json
{
  "threshold": 0,
  "reporters": ["console"],
  "ignore": [
    "**/node_modules/**",
    "**/dist/**",
    "**/coverage/**",
    "**/drizzle/**",
    "**/__tests__/**"
  ],
  "minTokens": 75,
  "absolute": true
}
```

**Step 3: Add npm script**

Add to root `package.json` scripts:

```json
"check:duplication": "jscpd ./packages --reporters console"
```

**Step 4: Run jscpd to see current state**

Run:
```bash
npm run check:duplication
```

Review output. If there are existing duplicates above the 75-token threshold, fix them before proceeding. This establishes a clean baseline.

**Step 5: Fix any existing duplicates**

For each duplicate found, decide whether to:
- Extract shared code into a common utility/function
- Refactor to eliminate the duplication
- If a specific file pattern is a false positive, add it to the `.jscpd.json` ignore list

**Step 6: Verify jscpd passes clean**

Run:
```bash
npm run check:duplication
```
Expected: No duplicates found (exit code 0)

**Step 7: Commit**

```bash
git add package.json package-lock.json .jscpd.json
git commit -m "feat: add jscpd for copy-paste detection"
```

---

### Task 4: Wire jscpd into pre-commit hook

**Files:**
- Modify: `.husky/pre-commit`

**Step 1: Add jscpd to pre-commit hook**

Update `.husky/pre-commit` to:

```bash
npx lint-staged
npm run check:duplication
```

**Step 2: Test the hook**

Create a temporary duplicate to verify the hook catches it:

```bash
# Create a test file with duplicated code
cat > /tmp/test-dup.ts << 'EOF'
// This is intentionally duplicated code for testing
export function testDuplicate1() {
  const items = [1, 2, 3, 4, 5];
  const result = items.map(item => item * 2).filter(item => item > 4).reduce((sum, item) => sum + item, 0);
  return result;
}
EOF

# Copy to two locations
cp /tmp/test-dup.ts packages/shared/src/dup-test-a.ts
cp /tmp/test-dup.ts packages/shared/src/dup-test-b.ts

# Try to commit (should fail)
git add packages/shared/src/dup-test-a.ts packages/shared/src/dup-test-b.ts
git commit -m "test: verify jscpd catches duplicates"
```

Expected: Commit blocked by jscpd detecting duplication.

**Step 3: Clean up test files**

```bash
rm packages/shared/src/dup-test-a.ts packages/shared/src/dup-test-b.ts
git reset HEAD
```

**Step 4: Commit**

```bash
git add .husky/pre-commit
git commit -m "feat: add jscpd to pre-commit hook"
```

---

### Task 5: Create the PostToolUse hook script

**Files:**
- Create: `.claude/hooks/post-edit-lint.sh`

**Step 1: Create the hooks directory**

```bash
mkdir -p .claude/hooks
```

**Step 2: Write the hook script**

Create `.claude/hooks/post-edit-lint.sh`:

```bash
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

# Step 2: Run tsc --noEmit on the full project (only if eslint passed)
TSC_OUTPUT=$(npx tsc --noEmit 2>&1) || {
  echo "TypeScript errors:" >&2
  echo "$TSC_OUTPUT" >&2
  exit 2
}

exit 0
```

**Step 3: Make the script executable**

```bash
chmod +x .claude/hooks/post-edit-lint.sh
```

**Step 4: Test the script manually**

```bash
echo '{"tool_input":{"file_path":"packages/shared/src/types.ts"}}' | .claude/hooks/post-edit-lint.sh
echo $?
```
Expected: Exit code 0 (no errors)

Test with a non-TS file (should skip):
```bash
echo '{"tool_input":{"file_path":"README.md"}}' | .claude/hooks/post-edit-lint.sh
echo $?
```
Expected: Exit code 0 (skipped)

**Step 5: Commit**

```bash
git add .claude/hooks/post-edit-lint.sh
git commit -m "feat: add PostToolUse lint hook script"
```

---

### Task 6: Configure Claude Code hook in settings

**Files:**
- Create: `.claude/settings.json`

**Step 1: Create project-level settings**

Create `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/post-edit-lint.sh",
            "timeout": 60
          }
        ]
      }
    ]
  }
}
```

**Step 2: Verify the hook is recognized**

Run Claude Code and check that the hook appears in settings. You can test by editing a TS file and confirming the hook fires.

**Step 3: Commit**

```bash
git add .claude/settings.json
git commit -m "feat: configure PostToolUse hook for agent linting"
```

---

### Task 7: End-to-end verification

**Step 1: Verify ESLint catches sonarjs violations**

Run:
```bash
npx eslint .
```
Expected: Clean (no errors)

**Step 2: Verify jscpd catches duplicates**

Run:
```bash
npm run check:duplication
```
Expected: Clean (no duplicates)

**Step 3: Verify pre-commit hook works end-to-end**

Make a small, valid change to a TS file, stage it, and commit. The pre-commit hook should:
1. Run lint-staged (eslint --fix + prettier on staged files)
2. Run jscpd on `packages/`
3. Allow the commit if both pass

**Step 4: Verify full build is clean**

Run:
```bash
npm run build
```
Expected: No TypeScript errors

**Step 5: Verify all tests pass with coverage**

Run:
```bash
npm run test:coverage
```
Expected: All tests pass, 80% coverage thresholds met

**Step 6: Commit any remaining fixes**

```bash
git add -A
git commit -m "chore: end-to-end verification of linting guardrails"
```
