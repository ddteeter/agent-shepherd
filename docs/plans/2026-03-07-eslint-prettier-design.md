# ESLint + Prettier Integration Design

**Date:** 2026-03-07
**Status:** Approved

## Overview

Introduce ESLint and Prettier to the agent-shepherd monorepo with strict TypeScript linting, opinionated modern JS rules, and automated formatting via pre-commit hooks.

## Tools & Packages

### ESLint

- **`eslint`** — core linter
- **`typescript-eslint`** — TypeScript integration using `strictTypeChecked` + `stylisticTypeChecked` presets
- **`eslint-plugin-unicorn`** — opinionated modern JS/TS rules (recommended preset)
- **`eslint-plugin-react-hooks`** — enforces React rules of hooks (frontend only)
- **`eslint-plugin-react-refresh`** — ensures HMR-compatible components (frontend only)
- **`eslint-config-prettier`** — disables ESLint rules that conflict with Prettier

### Prettier

- **`prettier`** — code formatter with minimal config

### Pre-commit

- **`husky`** — git hook management
- **`lint-staged`** — runs linter/formatter on staged files only

## Configuration

### ESLint (`eslint.config.js`)

Single root flat config file:

- Base: `strictTypeChecked` + `stylisticTypeChecked` + `unicorn/recommended` for all TS files
- Frontend override: add `react-hooks` + `react-refresh` for `packages/frontend/**`
- Ignores: `node_modules/`, `dist/`, `coverage/`, `*.db`, `drizzle/`
- `eslint-config-prettier` applied last to disable conflicting formatting rules

### Prettier (`.prettierrc`)

```json
{
  "singleQuote": true,
  "trailingComma": "all"
}
```

All other settings use Prettier defaults (2-space indent, 80 char print width, semicolons).

### Prettier Ignore (`.prettierignore`)

```
dist/
coverage/
drizzle/
*.db
package-lock.json
```

### lint-staged (in root `package.json`)

```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,css,html,yml,yaml}": ["prettier --write"]
  }
}
```

## Scripts

Root `package.json`:

```
"lint": "eslint .",
"lint:fix": "eslint --fix .",
"format": "prettier --write .",
"format:check": "prettier --check ."
```

Per-workspace lint scripts removed (single root config handles everything).

## Existing Violations

Run linter after setup, assess volume of violations. Fix what we can; selectively disable unicorn rules that are too noisy for this codebase.

## Decisions

- **Prettier runs separately from ESLint** (not via `eslint-plugin-prettier`) per official recommendation — better performance, cleaner output
- **`eslint-config-prettier`** handles conflict resolution between the two tools
- **Single root ESLint config** rather than per-package configs — simpler for monorepo
- **`strictTypeChecked`** is the strictest official typescript-eslint preset
