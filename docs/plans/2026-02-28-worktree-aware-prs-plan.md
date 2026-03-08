# Worktree-Aware PRs Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Store the agent's working directory on each PR so the orchestrator can re-dispatch agents to the correct worktree/directory during multi-cycle reviews.

**Architecture:** Add a nullable `workingDirectory` column to `pull_requests`. The CLI auto-captures `process.cwd()` on submit. The orchestrator uses `pr.workingDirectory ?? project.path` when spawning agents, with a directory-existence check before launch.

**Tech Stack:** SQLite/Drizzle (migration), TypeScript types, Fastify routes, React/Tailwind frontend, Commander.js CLI

**Design doc:** `docs/plans/2026-02-28-worktree-aware-prs-design.md`

---

### Task 1: Add `workingDirectory` column to schema + generate migration

**Files:**

- Modify: `packages/backend/src/db/schema.ts:12-23`

**Step 1: Add column to schema**

In `packages/backend/src/db/schema.ts`, add `workingDirectory` to the `pullRequests` table definition, after the `agentContext` line (line 20):

```typescript
workingDirectory: text('working_directory'),
```

**Step 2: Generate migration**

Run from `packages/backend/`:

```bash
cd packages/backend && npx drizzle-kit generate --name add_working_directory
```

Expected: A new migration file created in `packages/backend/drizzle/` with an `ALTER TABLE pull_requests ADD COLUMN working_directory text` statement.

**Step 3: Verify migration file**

Read the generated migration file and confirm it contains the correct `ALTER TABLE` statement.

**Step 4: Commit**

```bash
git add packages/backend/src/db/schema.ts packages/backend/drizzle/
git commit -m "feat: add workingDirectory column to pull_requests schema"
```

---

### Task 2: Update shared types

**Files:**

- Modify: `packages/shared/src/types.ts:24-35` (PullRequest interface)
- Modify: `packages/shared/src/types.ts:87-94` (CreatePRInput interface)

**Step 1: Add to PullRequest interface**

In `packages/shared/src/types.ts`, add `workingDirectory` to the `PullRequest` interface after `agentContext` (line 32):

```typescript
workingDirectory: string | null;
```

**Step 2: Add to CreatePRInput interface**

In the same file, add `workingDirectory` to `CreatePRInput` after `agentContext` (line 93):

```typescript
workingDirectory?: string;
```

**Step 3: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "feat: add workingDirectory to PullRequest and CreatePRInput types"
```

---

### Task 3: Update PR creation API route to persist workingDirectory

**Files:**

- Modify: `packages/backend/src/routes/pull-requests.ts:13-40`
- Test: `packages/backend/src/routes/__tests__/pull-requests.test.ts`

**Step 1: Write the failing test**

Add a new test to `packages/backend/src/routes/__tests__/pull-requests.test.ts`:

```typescript
it('POST /api/projects/:id/prs stores workingDirectory when provided', async () => {
  const response = await server.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/prs`,
    payload: {
      title: 'Worktree PR',
      description: 'From a worktree',
      sourceBranch: 'feat/worktree',
      workingDirectory: '/repo/.claude/worktrees/task-1',
    },
  });
  expect(response.statusCode).toBe(201);
  const body = response.json();
  expect(body.workingDirectory).toBe('/repo/.claude/worktrees/task-1');
});

it('POST /api/projects/:id/prs defaults workingDirectory to null', async () => {
  const response = await server.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/prs`,
    payload: {
      title: 'Normal PR',
      description: '',
      sourceBranch: 'feat/normal',
    },
  });
  expect(response.statusCode).toBe(201);
  expect(response.json().workingDirectory).toBeNull();
});
```

**Step 2: Run tests to verify they fail**

```bash
npm run test -- packages/backend/src/routes/__tests__/pull-requests.test.ts
```

Expected: FAIL — `workingDirectory` is not persisted or returned.

**Step 3: Update the route to accept and persist workingDirectory**

In `packages/backend/src/routes/pull-requests.ts`, update the PR creation route (line 15) to destructure `workingDirectory` from the request body:

```typescript
const { title, description, sourceBranch, baseBranch, workingDirectory } =
  request.body as Omit<CreatePRInput, 'projectId'>;
```

Then add it to the insert values (around line 38, after `status: 'open'`):

```typescript
workingDirectory: workingDirectory || null,
```

**Step 4: Run tests to verify they pass**

```bash
npm run test -- packages/backend/src/routes/__tests__/pull-requests.test.ts
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add packages/backend/src/routes/pull-requests.ts packages/backend/src/routes/__tests__/pull-requests.test.ts
git commit -m "feat: persist workingDirectory on PR creation"
```

---

### Task 4: Update orchestrator to use workingDirectory for agent spawning

**Files:**

- Modify: `packages/backend/src/orchestrator/index.ts:48-93`
- Test: `packages/backend/src/orchestrator/__tests__/orchestrator.test.ts`

**Step 1: Write the failing test**

Add a new test in `packages/backend/src/orchestrator/__tests__/orchestrator.test.ts` that creates a PR with a `workingDirectory` and verifies the orchestrator would use it. Since the orchestrator is disabled in tests and spawns real processes, test this by verifying the PR record stores `workingDirectory` and it's accessible alongside the project path (the actual spawning uses `project.path` currently):

```typescript
it('PR stores workingDirectory for orchestrator use', async () => {
  const createResp = await server.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/prs`,
    payload: {
      title: 'Worktree PR',
      description: '',
      sourceBranch: 'feat/worktree',
      workingDirectory: '/repo/.claude/worktrees/task-1',
    },
  });
  const pr = createResp.json();
  expect(pr.workingDirectory).toBe('/repo/.claude/worktrees/task-1');

  // Verify that both project.path and pr.workingDirectory are available
  const db = (server as any).db;
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, pr.projectId))
    .get();
  expect(project.path).toBe('/tmp/test');

  // Orchestrator should prefer pr.workingDirectory over project.path
  const effectivePath = pr.workingDirectory ?? project.path;
  expect(effectivePath).toBe('/repo/.claude/worktrees/task-1');
});
```

**Step 2: Run test to verify it passes** (this test validates the data flow, which should pass after Task 3)

```bash
npm run test -- packages/backend/src/orchestrator/__tests__/orchestrator.test.ts
```

**Step 3: Update orchestrator to resolve working directory**

In `packages/backend/src/orchestrator/index.ts`, in the `handleRequestChanges` method, change line 93 from:

```typescript
const session = await this.adapter.startSession({
  projectPath: project.path,
  prompt,
});
```

to:

```typescript
// Use the PR's working directory (e.g., worktree path) if available, otherwise fall back to project path
const effectivePath = pr.workingDirectory ?? project.path;

// Verify the working directory exists before spawning agent
const { existsSync } = await import('fs');
if (!existsSync(effectivePath)) {
  const error = new Error(
    `Working directory does not exist: ${effectivePath}\n` +
      'The worktree may have been removed. Recreate it and try again.',
  );
  this.setCycleStatus(currentCycle.id, 'agent_error');
  this.broadcast?.('agent:error', { prId, error: error.message });
  throw error;
}

const session = await this.adapter.startSession({
  projectPath: effectivePath,
  prompt,
});
```

Add the `existsSync` import at the top of the file:

```typescript
import { existsSync } from 'fs';
```

**Step 4: Run all tests**

```bash
npm run test -- packages/backend/
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add packages/backend/src/orchestrator/index.ts packages/backend/src/orchestrator/__tests__/orchestrator.test.ts
git commit -m "feat: orchestrator uses PR workingDirectory for agent spawning"
```

---

### Task 5: Update CLI submit command to auto-capture cwd

**Files:**

- Modify: `packages/cli/src/commands/submit.ts`

**Step 1: Add workingDirectory to the POST body**

In `packages/cli/src/commands/submit.ts`, update the `client.post` call (line 20) to include `workingDirectory`:

```typescript
const pr = await client.post(`/api/projects/${opts.project}/prs`, {
  title: opts.title || 'Agent PR',
  description: opts.description,
  sourceBranch: opts.sourceBranch || 'HEAD',
  agentContext,
  workingDirectory: process.cwd(),
});
```

**Step 2: Build to verify no TypeScript errors**

```bash
npm run build --workspace=packages/cli
```

Expected: Build succeeds.

**Step 3: Commit**

```bash
git add packages/cli/src/commands/submit.ts
git commit -m "feat: CLI submit auto-captures working directory from cwd"
```

---

### Task 6: Show workingDirectory in frontend PR detail page

**Files:**

- Modify: `packages/frontend/src/pages/PRReview.tsx:444`

**Step 1: Add workingDirectory display**

In `packages/frontend/src/pages/PRReview.tsx`, after the branch display line (line 444 `{pr.sourceBranch} &rarr; {pr.baseBranch}`), add a conditional display of the working directory:

```tsx
{pr.sourceBranch} &rarr; {pr.baseBranch}
{pr.workingDirectory && (
  <span
    className="ml-2 inline-block px-2 py-0.5 rounded text-xs"
    style={{ backgroundColor: 'rgba(130, 130, 130, 0.1)' }}
    title={pr.workingDirectory}
  >
    {pr.workingDirectory.split('/').slice(-2).join('/')}
  </span>
)}
```

This shows the last two path segments (e.g., `worktrees/task-1`) as a subtle tag, with the full path as a tooltip on hover.

**Step 2: Verify frontend builds**

```bash
npm run build --workspace=packages/frontend
```

Expected: Build succeeds (the `pr` object comes from the API as `any`, so no type error).

**Step 3: Commit**

```bash
git add packages/frontend/src/pages/PRReview.tsx
git commit -m "feat: show working directory metadata on PR detail page"
```

---

### Task 7: Update submit PR skill documentation

**Files:**

- Modify: `skills/agent-shepherd-submit-pr/SKILL.md`

**Step 1: Update the skill**

In `skills/agent-shepherd-submit-pr/SKILL.md`, add a note about working directory auto-detection. After step 1 ("Ensure All Changes Are Committed"), add:

```markdown
### 1b. Verify You're in the Correct Working Directory

The `submit` command automatically captures your current working directory (`cwd`). This is used by the orchestrator to re-dispatch agents to the correct location during multi-cycle reviews.

If you're working in a git worktree, make sure you run `shepherd submit` from inside the worktree directory, not the main repository checkout. The working directory is captured automatically — no flag needed.
```

Also add a row to the Flags table:

```markdown
| (auto) | — | Working directory is automatically captured from `cwd` |
```

**Step 2: Commit**

```bash
git add skills/agent-shepherd-submit-pr/SKILL.md
git commit -m "docs: update submit PR skill with working directory auto-capture"
```

---

### Task 8: Run full test suite and verify build

**Step 1: Run all tests**

```bash
npm run test
```

Expected: All tests PASS.

**Step 2: Build all packages**

```bash
npm run build
```

Expected: Build succeeds across all packages.

**Step 3: Manual smoke test (optional)**

Start the dev server and verify:

1. Submit a PR via CLI — check that `workingDirectory` appears in the database
2. View the PR in the web UI — check that the working directory tag appears
3. Verify existing PRs without `workingDirectory` still display correctly (no tag shown)
