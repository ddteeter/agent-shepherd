# Persistent Diffs for Closed PRs — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When a PR is not open (approved/closed), serve the latest diff snapshot from the database instead of computing from git, so diffs remain visible after branch deletion.

**Architecture:** Single backend change in the default diff handler — check PR status before attempting git diff, delegate to existing `handleCycleDiff()` for non-open PRs.

**Tech Stack:** Fastify, Drizzle ORM, Vitest

---

### Task 1: Write failing tests for non-open PR diff fallback

**Files:**

- Modify: `packages/backend/src/routes/__tests__/diff.test.ts`

**Step 1: Write failing tests**

Add these tests at the end of the existing `describe('Diff API')` block in `packages/backend/src/routes/__tests__/diff.test.ts`:

```typescript
it('GET /api/prs/:id/diff returns latest snapshot for approved PR', async () => {
  // Approve the PR (sets status to 'approved')
  await inject({
    method: 'POST',
    url: `/api/prs/${prId}/review`,
    payload: { action: 'approve' },
  });

  const response = await inject({
    method: 'GET',
    url: `/api/prs/${prId}/diff`,
  });
  expect(response.statusCode).toBe(200);
  const body = jsonBody(response);
  expect(body.diff).toContain('+const y = 2;');
  expect(body.isSnapshot).toBe(true);
  expect(body.cycleNumber).toBe(1);
});

it('GET /api/prs/:id/diff returns latest snapshot for closed PR', async () => {
  // Close the PR (sets status to 'closed')
  await inject({
    method: 'POST',
    url: `/api/prs/${prId}/close`,
  });

  const response = await inject({
    method: 'GET',
    url: `/api/prs/${prId}/diff`,
  });
  expect(response.statusCode).toBe(200);
  const body = jsonBody(response);
  expect(body.diff).toContain('+const y = 2;');
  expect(body.isSnapshot).toBe(true);
  expect(body.cycleNumber).toBe(1);
});

it('GET /api/prs/:id/diff returns 404 for non-open PR with no snapshots', async () => {
  // Delete all snapshots to simulate missing data, then close
  const db = server.db;
  db.delete(schema.diffSnapshots).run();

  await inject({
    method: 'POST',
    url: `/api/prs/${prId}/close`,
  });

  const response = await inject({
    method: 'GET',
    url: `/api/prs/${prId}/diff`,
  });
  expect(response.statusCode).toBe(404);
  expect(jsonBody(response).error).toContain('No diff snapshots available');
});
```

Note: The third test needs `schema` imported. Add to the existing imports at the top of the file:

```typescript
import { schema } from '../../db/index.js';
```

**Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=packages/backend -- --reporter verbose packages/backend/src/routes/__tests__/diff.test.ts`

Expected: The first two tests fail because the default handler still tries git instead of returning snapshots. The third test may also fail for the same reason.

**Step 3: Commit**

```bash
git add packages/backend/src/routes/__tests__/diff.test.ts
git commit -m "test: add failing tests for non-open PR diff fallback (#28)"
```

---

### Task 2: Implement the fallback logic

**Files:**

- Modify: `packages/backend/src/routes/diff.ts:172` (insert before line 173)

**Step 1: Add the fallback check**

In `packages/backend/src/routes/diff.ts`, insert the following block after line 171 (`if (cycle !== undefined) { ... }`) and before line 173 (`const project = ...`):

```typescript
// Non-open PRs: serve latest snapshot instead of computing from git
// (source branch may no longer exist after merge/close)
if (pr.status !== 'open') {
  const latestCycle = getLatestCycle(database, id);
  if (latestCycle) {
    return handleCycleDiff(
      database,
      id,
      String(latestCycle.cycleNumber),
      reply,
    );
  }
  return reply.code(404).send({ error: 'No diff snapshots available' });
}
```

**Step 2: Run tests to verify they pass**

Run: `npm run test --workspace=packages/backend -- --reporter verbose packages/backend/src/routes/__tests__/diff.test.ts`

Expected: All tests pass, including the three new ones and all existing ones.

**Step 3: Run full backend test suite**

Run: `npm run test --workspace=packages/backend`

Expected: All tests pass with no regressions.

**Step 4: Run build**

Run: `npm run build`

Expected: Clean build, zero TypeScript errors.

**Step 5: Commit**

```bash
git add packages/backend/src/routes/diff.ts
git commit -m "feat: serve latest snapshot for non-open PR diffs (#28)"
```

---

### Task 3: Verify coverage

**Step 1: Run coverage**

Run: `npm run test:coverage --workspace=packages/backend`

Expected: Coverage remains at or above 80% thresholds. The new code paths (non-open fallback, no-snapshot 404) are covered by the tests from Task 1.
