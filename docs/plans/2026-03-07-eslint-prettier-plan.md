# ESLint + Prettier Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add strict ESLint + Prettier with pre-commit hooks to the agent-shepherd monorepo.

**Architecture:** Single root ESLint flat config covers all 4 workspace packages with per-package overrides for React. Prettier runs separately (not inside ESLint). Husky + lint-staged auto-format/lint on commit.

**Tech Stack:** ESLint 10, typescript-eslint 8, eslint-plugin-unicorn 63, Prettier 3, husky 9, lint-staged 16

**Design doc:** `docs/plans/2026-03-07-eslint-prettier-design.md`

---

### Task 1: Install dependencies

**Files:**

- Modify: `package.json` (root)

**Step 1: Install ESLint + TypeScript ESLint + plugins**

```bash
npm install -D eslint typescript-eslint eslint-plugin-unicorn eslint-config-prettier eslint-plugin-react-hooks eslint-plugin-react-refresh
```

**Step 2: Install Prettier**

```bash
npm install -D prettier
```

**Step 3: Install husky + lint-staged**

```bash
npm install -D husky lint-staged
```

**Step 4: Verify all packages installed**

```bash
npm ls eslint typescript-eslint eslint-plugin-unicorn eslint-config-prettier prettier husky lint-staged
```

Expected: all listed without errors

**Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install eslint, prettier, husky, lint-staged dependencies"
```

---

### Task 2: Create ESLint flat config

**Files:**

- Create: `eslint.config.js`

**Step 1: Create `eslint.config.js` at the repo root**

```js
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import unicorn from 'eslint-plugin-unicorn';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      'node_modules/',
      'dist/',
      'coverage/',
      'drizzle/',
      '*.db',
      '*.config.js',
      '*.config.ts',
      'vite-env.d.ts',
    ],
  },

  // Base configs for all TS files
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  unicorn.configs['flat/recommended'],

  // TypeScript parser options — point at each package's tsconfig
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // React-specific rules (frontend only)
  {
    files: ['packages/frontend/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },

  // Disable prettier-conflicting rules (must be last)
  eslintConfigPrettier,
);
```

**Step 2: Run ESLint to see initial output**

```bash
npx eslint . 2>&1 | head -100
```

Expected: violations listed (we'll fix these in Task 5)

**Step 3: Commit**

```bash
git add eslint.config.js
git commit -m "chore: add ESLint flat config with strict TypeScript and unicorn rules"
```

---

### Task 3: Create Prettier config

**Files:**

- Create: `.prettierrc`
- Create: `.prettierignore`

**Step 1: Create `.prettierrc`**

```json
{
  "singleQuote": true,
  "trailingComma": "all"
}
```

**Step 2: Create `.prettierignore`**

```
dist/
coverage/
drizzle/
*.db
package-lock.json
```

**Step 3: Run Prettier check to see current state**

```bash
npx prettier --check . 2>&1 | tail -20
```

Expected: list of files that need formatting

**Step 4: Commit**

```bash
git add .prettierrc .prettierignore
git commit -m "chore: add Prettier config"
```

---

### Task 4: Add scripts and lint-staged config

**Files:**

- Modify: `package.json` (root)

**Step 1: Add scripts to root `package.json`**

Update the `"scripts"` section — replace the existing `"lint"` script and add new ones:

```json
{
  "lint": "eslint .",
  "lint:fix": "eslint --fix .",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "prepare": "husky"
}
```

Keep all existing scripts; just add/replace these.

**Step 2: Add lint-staged config to root `package.json`**

Add a top-level `"lint-staged"` key:

```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,css,html,yml,yaml}": ["prettier --write"]
  }
}
```

**Step 3: Remove per-workspace lint scripts**

Remove `"lint"` scripts from `packages/backend/package.json`, `packages/cli/package.json`, `packages/frontend/package.json`, and `packages/shared/package.json` if they exist (they currently don't have any, but verify).

**Step 4: Commit**

```bash
git add package.json
git commit -m "chore: add lint/format scripts and lint-staged config"
```

---

### Task 5: Set up husky pre-commit hook

**Files:**

- Create: `.husky/pre-commit`

**Step 1: Initialize husky**

```bash
npx husky init
```

Expected: creates `.husky/` directory with a `pre-commit` file

**Step 2: Set pre-commit hook content**

Write to `.husky/pre-commit`:

```bash
npx lint-staged
```

**Step 3: Verify hook is executable**

```bash
ls -la .husky/pre-commit
```

Expected: `-rwxr-xr-x` permissions

**Step 4: Commit**

```bash
git add .husky/
git commit -m "chore: add husky pre-commit hook with lint-staged"
```

---

### Task 6: Format the entire codebase with Prettier

**Files:**

- Modify: all `.ts`, `.tsx`, `.json`, `.md`, `.css`, `.html` files

**Step 1: Run Prettier on the whole repo**

```bash
npx prettier --write .
```

**Step 2: Verify formatting is clean**

```bash
npx prettier --check .
```

Expected: "All matched files use Prettier code style!"

**Step 3: Commit**

```bash
git add -A
git commit -m "style: format entire codebase with Prettier"
```

---

### Task 7: Fix ESLint violations

This is the largest task. Approach:

1. Run `npx eslint .` to see all violations
2. Run `npx eslint --fix .` to auto-fix what's possible
3. Manually fix remaining violations
4. If a unicorn rule is generating excessive noise with little value, disable it in `eslint.config.js` with a comment explaining why
5. Aim for zero violations — no blanket `eslint-disable` comments

**Step 1: Auto-fix what ESLint can**

```bash
npx eslint --fix .
```

**Step 2: See remaining violations**

```bash
npx eslint . 2>&1 | tail -50
```

**Step 3: Fix remaining violations manually or disable noisy rules**

For each violation category, decide: fix it or disable the rule in `eslint.config.js`. If disabling, add the rule override with a short comment explaining why.

**Step 4: Verify zero violations**

```bash
npx eslint .
```

Expected: clean output, exit code 0

**Step 5: Verify tests still pass**

```bash
npm run test
```

Expected: all tests pass

**Step 6: Verify build still works**

```bash
npm run build
```

Expected: clean build, no TypeScript errors

**Step 7: Commit**

```bash
git add -A
git commit -m "fix: resolve all ESLint violations"
```

---

### Task 8: Update CLAUDE.md and verify

**Files:**

- Modify: `CLAUDE.md`

**Step 1: Add lint/format commands to CLAUDE.md**

In the Commands section, add:

```bash
npm run lint                                 # Run ESLint
npm run lint:fix                             # Run ESLint with auto-fix
npm run format                               # Format all files with Prettier
npm run format:check                         # Check formatting without writing
```

**Step 2: Add linting convention note to Conventions section**

Add a note that pre-commit hooks run ESLint + Prettier automatically via lint-staged.

**Step 3: Run the full validation suite**

```bash
npm run build && npm run test && npm run lint && npm run format:check
```

Expected: all pass

**Step 4: Test the pre-commit hook**

Make a trivial whitespace change to a `.ts` file, stage it, and commit. Verify the hook runs lint-staged.

**Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add ESLint and Prettier commands to CLAUDE.md"
```
