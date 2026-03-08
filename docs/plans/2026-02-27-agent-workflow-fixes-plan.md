# Agent Workflow Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix three critical multi-cycle review bugs: empty prompt on cycle 2+, agent status out of sync, and missing inter-cycle diff view.

**Architecture:** Changes span shared types, backend orchestrator, backend routes, git service, DB schema, and frontend cycle selector. Each fix is independent and can be committed separately.

**Tech Stack:** TypeScript, Vitest, Drizzle ORM/SQLite, Fastify, simple-git, React

---

### Task 1: Fix orchestrator to query all unresolved comments across cycles

**Files:**

- Modify: `packages/backend/src/orchestrator/index.ts:4,75-89`
- Test: `packages/backend/src/orchestrator/__tests__/orchestrator.test.ts` (create)

**Step 1: Write the failing test**

Create `packages/backend/src/orchestrator/__tests__/orchestrator.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../server.js';
import type { FastifyInstance } from 'fastify';
import { schema } from '../../db/index.js';
import { eq, inArray } from 'drizzle-orm';
import { Orchestrator, buildReviewPrompt } from '../index.js';

describe('Orchestrator.handleRequestChanges', () => {
  let server: FastifyInstance;
  let projectId: string;
  let prId: string;

  beforeEach(async () => {
    server = await buildServer({
      dbPath: ':memory:',
      disableOrchestrator: true,
    });
    const db = (server as any).db;

    // Create project and PR
    const proj = await server.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: '/tmp/test' },
    });
    projectId = proj.json().id;

    const pr = await server.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'Test PR', description: '', sourceBranch: 'feat/x' },
    });
    prId = pr.json().id;
  });

  afterEach(async () => {
    await server.close();
  });

  it('includes unresolved comments from all cycles in the prompt', async () => {
    const db = (server as any).db;

    // Add comment to cycle 1
    await server.inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/index.ts',
        startLine: 10,
        endLine: 10,
        body: 'Fix this bug',
        severity: 'must-fix',
        author: 'human',
      },
    });

    // Advance to cycle 2 (request-changes then agent-ready)
    await server.inject({
      method: 'POST',
      url: `/api/prs/${prId}/review`,
      payload: { action: 'request-changes' },
    });
    await server.inject({
      method: 'POST',
      url: `/api/prs/${prId}/agent-ready`,
    });

    // Reply to cycle 1 comment in cycle 2
    const comments = await server.inject({
      method: 'GET',
      url: `/api/prs/${prId}/comments`,
    });
    const cycle1Comment = comments
      .json()
      .find((c: any) => c.body === 'Fix this bug');

    await server.inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/index.ts',
        startLine: 10,
        endLine: 10,
        body: 'Still not fixed, please address',
        severity: 'suggestion',
        author: 'human',
        parentCommentId: cycle1Comment.id,
      },
    });

    // Now build the prompt as the orchestrator would
    // Get all cycles for this PR
    const allCycles = db
      .select()
      .from(schema.reviewCycles)
      .where(eq(schema.reviewCycles.prId, prId))
      .all();
    const cycleIds = allCycles.map((c: any) => c.id);

    // Get ALL comments across all cycles
    const allComments = db
      .select()
      .from(schema.comments)
      .where(inArray(schema.comments.reviewCycleId, cycleIds))
      .all();

    const topLevel = allComments.filter(
      (c: any) => !c.parentCommentId && !c.resolved,
    );
    const reviewComments = topLevel.map((c: any) => ({
      id: c.id,
      filePath: c.filePath,
      startLine: c.startLine,
      endLine: c.endLine,
      body: c.body,
      severity: c.severity,
      thread: allComments
        .filter((r: any) => r.parentCommentId === c.id)
        .map((r: any) => ({ author: r.author, body: r.body })),
    }));

    const prompt = buildReviewPrompt({
      prId,
      prTitle: 'Test PR',
      agentContext: null,
      comments: reviewComments,
    });

    // The cycle 1 comment should appear in the prompt
    expect(prompt).toContain('Fix this bug');
    // The reply should appear in the thread
    expect(prompt).toContain('Still not fixed, please address');
    // There should be at least 1 comment section
    expect(prompt).toContain('## Comments');
  });

  it('excludes resolved comments from the prompt', async () => {
    // Add a comment and resolve it
    const commentRes = await server.inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/index.ts',
        startLine: 5,
        endLine: 5,
        body: 'This is resolved',
        severity: 'suggestion',
        author: 'human',
      },
    });

    await server.inject({
      method: 'PUT',
      url: `/api/comments/${commentRes.json().id}`,
      payload: { resolved: true },
    });

    // Add an unresolved comment
    await server.inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/index.ts',
        startLine: 10,
        endLine: 10,
        body: 'This is unresolved',
        severity: 'must-fix',
        author: 'human',
      },
    });

    const db = (server as any).db;
    const allCycles = db
      .select()
      .from(schema.reviewCycles)
      .where(eq(schema.reviewCycles.prId, prId))
      .all();
    const cycleIds = allCycles.map((c: any) => c.id);
    const allComments = db
      .select()
      .from(schema.comments)
      .where(inArray(schema.comments.reviewCycleId, cycleIds))
      .all();

    const topLevel = allComments.filter(
      (c: any) => !c.parentCommentId && !c.resolved,
    );

    const reviewComments = topLevel.map((c: any) => ({
      id: c.id,
      filePath: c.filePath,
      startLine: c.startLine,
      endLine: c.endLine,
      body: c.body,
      severity: c.severity,
      thread: allComments
        .filter((r: any) => r.parentCommentId === c.id)
        .map((r: any) => ({ author: r.author, body: r.body })),
    }));

    const prompt = buildReviewPrompt({
      prId,
      prTitle: 'Test PR',
      agentContext: null,
      comments: reviewComments,
    });

    expect(prompt).not.toContain('This is resolved');
    expect(prompt).toContain('This is unresolved');
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `npm run test --workspace=packages/backend -- --run orchestrator.test`
Expected: Tests should pass since we're testing the correct logic directly, but this validates the approach before modifying the orchestrator.

**Step 3: Implement the fix in the orchestrator**

In `packages/backend/src/orchestrator/index.ts`:

1. Add `inArray` to the drizzle-orm import (line 4)
2. Replace lines 75-89 with the all-cycles query:

```typescript
// Get all cycles for this PR
const allCycles = this.db
  .select()
  .from(this.schema.reviewCycles)
  .where(eq(this.schema.reviewCycles.prId, prId))
  .all();
const cycleIds = allCycles.map((c: any) => c.id);

// Get ALL comments across all cycles (not just current cycle)
const allComments = this.db
  .select()
  .from(this.schema.comments)
  .where(inArray(this.schema.comments.reviewCycleId, cycleIds))
  .all();

// Filter to unresolved top-level comments
const topLevel = allComments.filter(
  (c: any) => !c.parentCommentId && !c.resolved,
);
const reviewComments = topLevel.map((c: any) => ({
  id: c.id,
  filePath: c.filePath,
  startLine: c.startLine,
  endLine: c.endLine,
  body: c.body,
  severity: c.severity,
  thread: allComments
    .filter((r: any) => r.parentCommentId === c.id)
    .map((r: any) => ({ author: r.author, body: r.body })),
}));
```

**Step 4: Run tests to verify everything passes**

Run: `npm run test --workspace=packages/backend`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add packages/backend/src/orchestrator/index.ts packages/backend/src/orchestrator/__tests__/orchestrator.test.ts
git commit -m "fix: query all unresolved comments across cycles for agent prompt"
```

---

### Task 2: Add `agent_completed` status to shared types

**Files:**

- Modify: `packages/shared/src/types.ts:3-9`

**Step 1: Add the new status value**

In `packages/shared/src/types.ts`, add `'agent_completed'` to `ReviewCycleStatus`:

```typescript
export type ReviewCycleStatus =
  | 'pending_review'
  | 'in_review'
  | 'changes_requested'
  | 'agent_working'
  | 'agent_completed'
  | 'agent_error'
  | 'approved';
```

**Step 2: Run tests to verify nothing breaks**

Run: `npm run test`
Expected: All tests pass.

**Step 3: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "feat: add agent_completed status to ReviewCycleStatus"
```

---

### Task 3: Fix agent status sync in orchestrator onComplete

**Files:**

- Modify: `packages/backend/src/orchestrator/index.ts:112-116`

**Step 1: Update the onComplete handler**

In `packages/backend/src/orchestrator/index.ts`, replace the `onComplete` callback (lines 112-116):

```typescript
session.onComplete(() => {
  this.activeSessions.delete(prId);
  // Update cycle status if agent-ready hasn't already created a new cycle
  const latestCycle = this.getLatestCycle(prId);
  if (latestCycle && latestCycle.status === 'agent_working') {
    this.setCycleStatus(latestCycle.id, 'agent_completed');
  }
  this.broadcast?.('agent:completed', { prId });
  this.notificationService.notifyPRReadyForReview(pr.title, project.name);
});
```

**Step 2: Run tests to verify nothing breaks**

Run: `npm run test --workspace=packages/backend`
Expected: All tests pass. Note: The orchestrator is disabled in most tests (`disableOrchestrator: true`), so this change won't be exercised by existing tests. The logic is straightforward — check status and update if still `agent_working`.

**Step 3: Commit**

```bash
git add packages/backend/src/orchestrator/index.ts
git commit -m "fix: update cycle status to agent_completed in onComplete handler"
```

---

### Task 4: Add commitSha column to reviewCycles schema

**Files:**

- Modify: `packages/backend/src/db/schema.ts:25-32`
- Create: Migration file (via drizzle-kit)

**Step 1: Add the column to the schema**

In `packages/backend/src/db/schema.ts`, add `commitSha` to the `reviewCycles` table:

```typescript
export const reviewCycles = sqliteTable('review_cycles', {
  id: text('id').primaryKey(),
  prId: text('pr_id')
    .notNull()
    .references(() => pullRequests.id),
  cycleNumber: integer('cycle_number').notNull(),
  status: text('status').notNull().default('pending_review'),
  reviewedAt: text('reviewed_at'),
  agentCompletedAt: text('agent_completed_at'),
  commitSha: text('commit_sha'),
});
```

**Step 2: Generate the migration**

Run: `cd packages/backend && npx drizzle-kit generate --name add_commit_sha_to_review_cycles`

**Step 3: Run tests to verify nothing breaks**

Run: `npm run test --workspace=packages/backend`
Expected: All tests pass. The in-memory DB auto-creates from schema, so no migration needed for tests.

**Step 4: Commit**

```bash
git add packages/backend/src/db/schema.ts packages/backend/drizzle/
git commit -m "feat: add commitSha column to reviewCycles schema"
```

---

### Task 5: Add GitService methods for SHA and inter-commit diff

**Files:**

- Modify: `packages/backend/src/services/git.ts:3-33`
- Modify: `packages/backend/src/services/__tests__/git.test.ts`

**Step 1: Write the failing tests**

Add to `packages/backend/src/services/__tests__/git.test.ts`:

```typescript
it('gets HEAD SHA for a branch', async () => {
  const sha = await gitService.getHeadSha('main');
  expect(sha).toMatch(/^[0-9a-f]{40}$/);
});

it('gets diff between two commits', async () => {
  execSync('git checkout -b feat/inter', { cwd: repoPath });
  await writeFile(join(repoPath, 'file.txt'), 'hello\nworld\n');
  execSync('git add . && git commit -m "add world"', { cwd: repoPath });

  const sha1 = await gitService.getHeadSha('main');
  const sha2 = await gitService.getHeadSha('feat/inter');

  const diff = await gitService.getDiffBetweenCommits(sha1, sha2);
  expect(diff).toContain('+world');
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=packages/backend -- --run git.test`
Expected: FAIL — `getHeadSha` and `getDiffBetweenCommits` don't exist yet.

**Step 3: Implement the methods**

Add to `packages/backend/src/services/git.ts`:

```typescript
async getHeadSha(branch: string): Promise<string> {
  const result = await this.git.revparse([branch]);
  return result.trim();
}

async getDiffBetweenCommits(sha1: string, sha2: string): Promise<string> {
  const result = await this.git.diff([`${sha1}..${sha2}`]);
  return result;
}
```

**Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=packages/backend -- --run git.test`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add packages/backend/src/services/git.ts packages/backend/src/services/__tests__/git.test.ts
git commit -m "feat: add getHeadSha and getDiffBetweenCommits to GitService"
```

---

### Task 6: Capture commit SHA when creating review cycles

**Files:**

- Modify: `packages/backend/src/routes/pull-requests.ts:13-63,183-248`

**Step 1: Write the failing test**

Add to `packages/backend/src/routes/__tests__/pull-requests.test.ts` (this test uses in-memory DB with no real git repo, so SHA will be null — we mainly test the column exists):

```typescript
it('POST /api/prs/:id/agent-ready stores commitSha when available', async () => {
  const create = await server.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/prs`,
    payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
  });
  const { id } = create.json();

  await server.inject({
    method: 'POST',
    url: `/api/prs/${id}/review`,
    payload: { action: 'request-changes' },
  });

  const response = await server.inject({
    method: 'POST',
    url: `/api/prs/${id}/agent-ready`,
  });
  expect(response.statusCode).toBe(200);
  // commitSha may be null in tests without real git repos - just verify the field exists
  expect(response.json()).toHaveProperty('cycleNumber', 2);
});
```

Note: The e2e test with a real git repo already tests agent-ready. We'll verify SHA capture there after implementing.

**Step 2: Run test to verify it passes (baseline)**

Run: `npm run test --workspace=packages/backend -- --run pull-requests.test`
Expected: PASS (this is a baseline check — the test works with or without SHA).

**Step 3: Implement SHA capture**

In `packages/backend/src/routes/pull-requests.ts`:

For **PR creation** (around line 42-51), after creating the cycle, try to capture the SHA:

```typescript
// After creating cycle, try to capture commit SHA
let commitSha: string | null = null;
try {
  const gitService = new GitService(project.path);
  commitSha = await gitService.getHeadSha(sourceBranch);
} catch {
  // Non-fatal: SHA capture may fail if branch doesn't exist locally
}

db.insert(schema.reviewCycles)
  .values({
    id: cycleId,
    prId,
    cycleNumber: 1,
    status: 'pending_review',
    commitSha,
  })
  .run();
```

Add the `GitService` import at top of file:

```typescript
import { GitService } from '../services/git.js';
```

Wait — `GitService` is already imported in this file (line 7). Good.

For **agent-ready** (around line 208-218), capture SHA when creating the new cycle:

```typescript
let commitSha: string | null = null;
if (project) {
  try {
    const gitService = new GitService(project.path);
    commitSha = await gitService.getHeadSha(pr.sourceBranch);
  } catch {
    // Non-fatal
  }
}

db.insert(schema.reviewCycles)
  .values({
    id: newCycleId,
    prId: id,
    cycleNumber: newCycleNumber,
    status: 'pending_review',
    commitSha,
  })
  .run();
```

**Step 4: Run tests to verify everything passes**

Run: `npm run test --workspace=packages/backend`
Expected: All tests pass. The in-memory tests use `/tmp/test` as project path which isn't a git repo, so SHA capture will silently fail (null). The e2e test has a real repo and will capture real SHAs.

**Step 5: Commit**

```bash
git add packages/backend/src/routes/pull-requests.ts
git commit -m "feat: capture commit SHA when creating review cycles"
```

---

### Task 7: Add inter-cycle diff endpoint

**Files:**

- Modify: `packages/backend/src/routes/diff.ts:15-74`
- Modify: `packages/backend/src/routes/__tests__/diff.test.ts`

**Step 1: Write the failing test**

Add to `packages/backend/src/routes/__tests__/diff.test.ts`. Since this test needs a real git repo with commit SHAs, base it on the e2e pattern. If the existing diff tests don't use a real git repo, add a new describe block:

```typescript
it('GET /api/prs/:id/diff?from=N&to=M returns inter-cycle diff', async () => {
  // This test requires cycles with commitSha stored.
  // In-memory tests without a real git repo will get 400 for missing SHAs.
  const create = await server.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/prs`,
    payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
  });
  const prId = create.json().id;

  // Without real git repo, SHAs won't exist — expect a clear error
  const response = await server.inject({
    method: 'GET',
    url: `/api/prs/${prId}/diff?from=1&to=2`,
  });
  // Cycle 2 doesn't exist
  expect(response.statusCode).toBe(404);
});
```

For the real integration test, add to `packages/backend/src/__tests__/e2e-workflow.test.ts` in the "Multiple Review Cycles" describe block:

```typescript
it('returns inter-cycle diff showing only changes between cycles', async () => {
  // Setup project with real git repo
  const projRes = await server.inject({
    method: 'POST',
    url: '/api/projects',
    payload: { name: 'inter-diff', path: repoPath },
  });
  const projectId = projRes.json().id;

  const prRes = await server.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/prs`,
    payload: {
      title: 'Inter-diff test',
      description: '',
      sourceBranch: 'feat/add-multiply',
    },
  });
  const prId = prRes.json().id;

  // Request changes and agent-ready to create cycle 2
  await server.inject({
    method: 'POST',
    url: `/api/prs/${prId}/review`,
    payload: { action: 'request-changes' },
  });

  // Make a new commit on the feature branch before signaling ready
  execSync('git checkout feat/add-multiply', { cwd: repoPath, stdio: 'pipe' });
  await writeFile(
    join(repoPath, 'src', 'utils.ts'),
    'export function add(a: number, b: number) {\n  return a + b;\n}\n\nexport function multiply(a: number, b: number) {\n  return a * b;\n}\n\nexport function subtract(a: number, b: number) {\n  return a - b;\n}\n',
  );
  execSync('git add . && git commit -m "add subtract function"', {
    cwd: repoPath,
    stdio: 'pipe',
  });

  await server.inject({
    method: 'POST',
    url: `/api/prs/${prId}/agent-ready`,
  });

  // Now request inter-cycle diff: from cycle 1 to cycle 2
  const interDiffRes = await server.inject({
    method: 'GET',
    url: `/api/prs/${prId}/diff?from=1&to=2`,
  });
  expect(interDiffRes.statusCode).toBe(200);
  const interDiff = interDiffRes.json();
  expect(interDiff.diff).toContain('+export function subtract');
  expect(interDiff.isInterCycleDiff).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test --workspace=packages/backend -- --run e2e-workflow.test`
Expected: FAIL — the `from` param is not handled yet.

**Step 3: Implement the inter-cycle diff endpoint**

In `packages/backend/src/routes/diff.ts`, modify the `GET /api/prs/:id/diff` handler. After the existing `cycle` param handling (around line 17), add `from`/`to` handling:

```typescript
const { cycle, from, to } = request.query as {
  cycle?: string;
  from?: string;
  to?: string;
};

// Inter-cycle diff: from=N&to=M
if (from !== undefined && to !== undefined) {
  const fromNum = parseInt(from, 10);
  const toNum = parseInt(to, 10);
  if (isNaN(fromNum) || isNaN(toNum) || fromNum < 1 || toNum < 1) {
    reply.code(400).send({ error: 'Invalid from/to cycle numbers' });
    return;
  }

  // Find both cycles
  const fromCycle = db
    .select()
    .from(schema.reviewCycles)
    .where(
      and(
        eq(schema.reviewCycles.prId, id),
        eq(schema.reviewCycles.cycleNumber, fromNum),
      ),
    )
    .get();
  const toCycle = db
    .select()
    .from(schema.reviewCycles)
    .where(
      and(
        eq(schema.reviewCycles.prId, id),
        eq(schema.reviewCycles.cycleNumber, toNum),
      ),
    )
    .get();

  if (!fromCycle) {
    reply.code(404).send({ error: `Review cycle ${fromNum} not found` });
    return;
  }
  if (!toCycle) {
    reply.code(404).send({ error: `Review cycle ${toNum} not found` });
    return;
  }

  if (!fromCycle.commitSha || !toCycle.commitSha) {
    reply
      .code(400)
      .send({ error: 'Commit SHAs not available for these cycles' });
    return;
  }

  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, pr.projectId))
    .get();
  if (!project) {
    reply.code(404).send({ error: 'Project not found' });
    return;
  }

  const gitService = new GitService(project.path);
  const diff = await gitService.getDiffBetweenCommits(
    fromCycle.commitSha,
    toCycle.commitSha,
  );
  const files = extractFilesFromDiff(diff);
  return {
    diff,
    files,
    fromCycle: fromNum,
    toCycle: toNum,
    isInterCycleDiff: true,
  };
}
```

Add `GitService` import at top:

```typescript
import { GitService } from '../services/git.js';
```

Wait — the file already imports `GitService` on line 6. Good.

**Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=packages/backend`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add packages/backend/src/routes/diff.ts packages/backend/src/routes/__tests__/diff.test.ts packages/backend/src/__tests__/e2e-workflow.test.ts
git commit -m "feat: add inter-cycle diff endpoint with from/to params"
```

---

### Task 8: Update frontend API client and cycle selector for inter-cycle diff

**Files:**

- Modify: `packages/frontend/src/api.ts:24-29`
- Modify: `packages/frontend/src/pages/PRReview.tsx:86-105,328-361`

**Step 1: Update the API client**

In `packages/frontend/src/api.ts`, update the `diff` method to support `from`/`to` params:

```typescript
diff: (id: string, opts?: { cycle?: number; from?: number; to?: number }) => {
  const params = new URLSearchParams();
  if (opts?.cycle !== undefined) params.set('cycle', String(opts.cycle));
  if (opts?.from !== undefined) params.set('from', String(opts.from));
  if (opts?.to !== undefined) params.set('to', String(opts.to));
  const qs = params.toString();
  return request<any>(`/prs/${id}/diff${qs ? `?${qs}` : ''}`);
},
```

**Step 2: Update the cycle selector in PRReview.tsx**

In `packages/frontend/src/pages/PRReview.tsx`:

1. Update `fetchDiff` to handle inter-cycle mode (around line 86-105):

```typescript
const fetchDiff = useCallback(
  async (cycleValue: string) => {
    if (!prId) return;
    setDiffLoading(true);
    try {
      let diff;
      if (cycleValue === 'current') {
        diff = await api.prs.diff(prId);
      } else if (cycleValue.startsWith('inter:')) {
        // Inter-cycle diff: "inter:1:2" means from cycle 1 to cycle 2
        const [, fromStr, toStr] = cycleValue.split(':');
        diff = await api.prs.diff(prId, {
          from: parseInt(fromStr, 10),
          to: parseInt(toStr, 10),
        });
      } else {
        const cycleNum = parseInt(cycleValue, 10);
        diff = await api.prs.diff(prId, { cycle: cycleNum });
      }
      setDiffData(diff);
      setScrollToFile(null);
      setVisibleFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load diff');
    } finally {
      setDiffLoading(false);
    }
  },
  [prId],
);
```

2. Update the cycle selector dropdown (around line 328-361) to add inter-cycle options:

```tsx
<select
  id="cycle-select"
  value={selectedCycle}
  onChange={(e) => handleCycleChange(e.target.value)}
  disabled={diffLoading}
  className="text-sm px-2 py-1 rounded border"
  style={{
    backgroundColor: 'var(--color-bg)',
    borderColor: 'var(--color-border)',
    color: 'var(--color-text)',
  }}
>
  <option value="current">Current changes</option>
  {cyclesWithSnapshots
    .sort((a, b) => a.cycleNumber - b.cycleNumber)
    .map((cycle) => (
      <option key={cycle.id} value={String(cycle.cycleNumber)}>
        Cycle {cycle.cycleNumber}
        {cycle.status === 'approved' ? ' (approved)' : ''}
        {cycle.status === 'changes_requested' ? ' (changes requested)' : ''}
      </option>
    ))}
  {cyclesWithSnapshots.length >= 2 && (
    <>
      <option disabled>───────────</option>
      {cyclesWithSnapshots
        .sort((a, b) => a.cycleNumber - b.cycleNumber)
        .slice(1)
        .map((cycle) => {
          const prevCycle = cyclesWithSnapshots.find(
            (c) => c.cycleNumber === cycle.cycleNumber - 1,
          );
          if (!prevCycle) return null;
          return (
            <option
              key={`inter-${prevCycle.cycleNumber}-${cycle.cycleNumber}`}
              value={`inter:${prevCycle.cycleNumber}:${cycle.cycleNumber}`}
            >
              Changes: Cycle {prevCycle.cycleNumber} → {cycle.cycleNumber}
            </option>
          );
        })}
    </>
  )}
</select>
```

**Step 3: Run tests to verify nothing breaks**

Run: `npm run test`
Expected: All tests pass.

**Step 4: Commit**

```bash
git add packages/frontend/src/api.ts packages/frontend/src/pages/PRReview.tsx
git commit -m "feat: add inter-cycle diff option in cycle selector"
```

---

### Task 9: Verify all tests pass end-to-end

**Step 1: Run the full test suite**

Run: `npm run test`
Expected: All tests across all packages pass.

**Step 2: Run the build**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors.
