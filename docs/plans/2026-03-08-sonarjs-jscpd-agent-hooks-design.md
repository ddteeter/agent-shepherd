# SonarJS, jscpd, and Agent Linting Hooks Design

**Date:** 2026-03-08
**Status:** Approved

## Overview

Layer eslint-plugin-sonarjs (complexity/code-smell rules) and jscpd (copy-paste detection) onto the existing ESLint + Prettier setup. Wire linting into the agentic workflow via a Claude Code PostToolUse hook that enforces clean code at edit time.

## Tools & Packages

### ESLint Plugin

- **`eslint-plugin-sonarjs`** — `recommended` preset for cognitive complexity, duplicate detection, and code smell rules

### Copy-Paste Detection

- **`jscpd`** — standalone duplicate code detector, configured at 75-token minimum clone size

## Configuration

### eslint-plugin-sonarjs

Added to the existing `eslint.config.js` flat config:

```js
import sonarjs from 'eslint-plugin-sonarjs';

// In config array:
sonarjs.configs.recommended,
```

Applies to all TS/TSX files alongside existing `strictTypeChecked`, `unicorn/recommended`, and React rules.

Disable rules that overlap with typescript-eslint (in the rules block alongside existing unicorn overrides):

```js
'sonarjs/no-unused-vars': 'off',
'sonarjs/unused-import': 'off',
'sonarjs/no-dead-store': 'off',
```

These three rules duplicate what `@typescript-eslint/no-unused-vars` already covers. All other sonarjs recommended rules stay enabled.

### jscpd (`.jscpd.json`)

```json
{
  "threshold": 5,
  "minTokens": 75,
  "minLines": 5,
  "mode": "strict",
  "reporters": ["console"],
  "ignore": [
    "**/node_modules/**",
    "**/dist/**",
    "**/coverage/**",
    "**/drizzle/**",
    "**/__tests__/**"
  ],
  "gitignore": true
}
```

- **`minTokens: 75`** — catches meaningful duplication without flagging trivial patterns
- **`minLines: 5`** — minimum 5 lines to flag as duplicate
- **`threshold: 5`** — allows up to 5% project-wide duplication before failing (zero tolerance is too aggressive)
- **`mode: "strict"`** — strict matching for accurate detection
- **`gitignore: true`** — automatically respects .gitignore patterns
- **Test files ignored** — tests often have legitimate repetition in setup/assertions

### Scripts

Root `package.json`:

```
"check:duplication": "jscpd ./packages --reporters console"
```

### Pre-commit Hook

`.husky/pre-commit`:

```bash
npx lint-staged
npm run check:duplication
```

jscpd runs after lint-staged, scanning the full `packages/` directory. Blocks commit if clones are found.

## Claude Code PostToolUse Hook

### Configuration

`.claude/settings.json` (project-level):

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

### Hook Script (`.claude/hooks/post-edit-lint.sh`)

Triggered after every Edit/Write tool call on TS/TSX files:

1. Read stdin JSON, extract `tool_input.file_path`
2. Skip non-TS/TSX files (exit 0)
3. Run `npx eslint --fix <file>` — auto-fixes what it can
4. If eslint reports remaining errors, exit 2 (blocks agent, surfaces errors)
5. Run `npx tsc --noEmit` (full project) — catches cross-file type breakage
6. If tsc fails, exit 2 (blocks agent, surfaces errors)
7. If both pass, exit 0

### Behavior

- **Exit code 2** blocks the agent and surfaces error output, forcing immediate fixes
- **eslint --fix** auto-corrects formatting and simple lint issues before reporting
- **eslint scoped to changed file** for speed; **tsc runs full project** for cross-file safety
- **60s timeout** — generous for tsc on this codebase
- Only triggers on TS/TSX files — no overhead on JSON, MD, etc.

## Explicit Exclusions

- **No jscpd in PostToolUse hook** — duplication is a commit-time concern, too slow/noisy at edit time
- **No Prettier in PostToolUse hook** — already handled by eslint --fix and lint-staged
- **No jscpd CI integration** — pre-commit hook is the enforcement point for now
- **No custom sonarjs rule overrides** beyond disabling typescript-eslint overlaps

## Decisions

- **sonarjs `recommended` preset** — broad coverage, automatically picks up new rules on upgrades
- **jscpd as standalone tool** (not ESLint plugin) — better cross-file detection, cleaner separation of concerns
- **PostToolUse hook blocks on failure** (exit 2) — forces agents to fix issues immediately rather than accumulating debt
- **eslint before tsc in hook** — fix auto-fixable issues first, then check types; skip tsc if lint fails
- **Full-project tsc, per-file eslint** — eslint is file-scoped anyway, tsc needs full project for cross-module type checking
