# Close/Reopen PR Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow humans to close and reopen PRs from both the PR detail page and the PR list view.

**Architecture:** Two new POST endpoints (`/close`, `/reopen`) on the PR routes with precondition validation. Frontend gets close/reopen buttons on both ProjectView (list) and PRReview (detail) pages. API client gets two new methods. No schema or orchestrator changes needed.

**Tech Stack:** Fastify routes, React components, Vitest tests

**Design doc:** `docs/plans/2026-02-26-close-reopen-pr-design.md`

---

### Task 1: Backend — Close and Reopen Endpoints (Tests)

**Files:**

- Modify: `packages/backend/src/routes/__tests__/pull-requests.test.ts`

**Step 1: Write failing tests for close and reopen**

Add these tests at the end of the existing `describe('Pull Requests API')` block in `packages/backend/src/routes/__tests__/pull-requests.test.ts`:

```typescript
it('POST /api/prs/:id/close closes an open PR', async () => {
  const create = await server.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/prs`,
    payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
  });
  const { id } = create.json();

  const response = await server.inject({
    method: 'POST',
    url: `/api/prs/${id}/close`,
  });
  expect(response.statusCode).toBe(200);
  expect(response.json().status).toBe('closed');

  const pr = await server.inject({ method: 'GET', url: `/api/prs/${id}` });
  expect(pr.json().status).toBe('closed');
});

it('POST /api/prs/:id/close returns 400 for already-closed PR', async () => {
  const create = await server.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/prs`,
    payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
  });
  const { id } = create.json();

  await server.inject({ method: 'POST', url: `/api/prs/${id}/close` });
  const response = await server.inject({
    method: 'POST',
    url: `/api/prs/${id}/close`,
  });
  expect(response.statusCode).toBe(400);
});

it('POST /api/prs/:id/close returns 400 for approved PR', async () => {
  const create = await server.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/prs`,
    payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
  });
  const { id } = create.json();

  await server.inject({
    method: 'POST',
    url: `/api/prs/${id}/review`,
    payload: { action: 'approve' },
  });

  const response = await server.inject({
    method: 'POST',
    url: `/api/prs/${id}/close`,
  });
  expect(response.statusCode).toBe(400);
});

it('POST /api/prs/:id/close returns 404 for nonexistent PR', async () => {
  const response = await server.inject({
    method: 'POST',
    url: '/api/prs/nonexistent/close',
  });
  expect(response.statusCode).toBe(404);
});

it('POST /api/prs/:id/reopen reopens a closed PR', async () => {
  const create = await server.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/prs`,
    payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
  });
  const { id } = create.json();

  await server.inject({ method: 'POST', url: `/api/prs/${id}/close` });

  const response = await server.inject({
    method: 'POST',
    url: `/api/prs/${id}/reopen`,
  });
  expect(response.statusCode).toBe(200);
  expect(response.json().status).toBe('open');

  const pr = await server.inject({ method: 'GET', url: `/api/prs/${id}` });
  expect(pr.json().status).toBe('open');
});

it('POST /api/prs/:id/reopen returns 400 for non-closed PR', async () => {
  const create = await server.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/prs`,
    payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
  });
  const { id } = create.json();

  const response = await server.inject({
    method: 'POST',
    url: `/api/prs/${id}/reopen`,
  });
  expect(response.statusCode).toBe(400);
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test --workspace=packages/backend -- --run packages/backend/src/routes/__tests__/pull-requests.test.ts`
Expected: 6 new tests FAIL (routes don't exist yet)

---

### Task 2: Backend — Implement Close and Reopen Endpoints

**Files:**

- Modify: `packages/backend/src/routes/pull-requests.ts:315` (add after cancel-agent endpoint, before cycles endpoint)

**Step 1: Add close endpoint**

Insert after the `cancel-agent` endpoint (after line 315) and before the `cycles` endpoint:

```typescript
// POST /api/prs/:id/close — Close a PR
fastify.post('/api/prs/:id/close', async (request, reply) => {
  const { id } = request.params as { id: string };

  const pr = db
    .select()
    .from(schema.pullRequests)
    .where(eq(schema.pullRequests.id, id))
    .get();

  if (!pr) {
    reply.code(404).send({ error: 'Pull request not found' });
    return;
  }

  if (pr.status !== 'open') {
    reply
      .code(400)
      .send({ error: `Cannot close a PR with status '${pr.status}'` });
    return;
  }

  // Check if agent is currently working
  const cycles = db
    .select()
    .from(schema.reviewCycles)
    .where(eq(schema.reviewCycles.prId, id))
    .all();

  const latestCycle = cycles.reduce(
    (latest: any, cycle: any) =>
      cycle.cycleNumber > (latest?.cycleNumber ?? 0) ? cycle : latest,
    null,
  );

  if (latestCycle?.status === 'agent_working') {
    reply
      .code(409)
      .send({ error: 'Agent is currently working. Cancel the agent first.' });
    return;
  }

  const now = new Date().toISOString();
  db.update(schema.pullRequests)
    .set({ status: 'closed', updatedAt: now })
    .where(eq(schema.pullRequests.id, id))
    .run();

  const updated = db
    .select()
    .from(schema.pullRequests)
    .where(eq(schema.pullRequests.id, id))
    .get();

  const broadcast = (fastify as any).broadcast;
  if (broadcast) broadcast('pr:updated', updated);

  return updated;
});

// POST /api/prs/:id/reopen — Reopen a closed PR
fastify.post('/api/prs/:id/reopen', async (request, reply) => {
  const { id } = request.params as { id: string };

  const pr = db
    .select()
    .from(schema.pullRequests)
    .where(eq(schema.pullRequests.id, id))
    .get();

  if (!pr) {
    reply.code(404).send({ error: 'Pull request not found' });
    return;
  }

  if (pr.status !== 'closed') {
    reply.code(400).send({ error: 'Only closed PRs can be reopened' });
    return;
  }

  const now = new Date().toISOString();
  db.update(schema.pullRequests)
    .set({ status: 'open', updatedAt: now })
    .where(eq(schema.pullRequests.id, id))
    .run();

  const updated = db
    .select()
    .from(schema.pullRequests)
    .where(eq(schema.pullRequests.id, id))
    .get();

  const broadcast = (fastify as any).broadcast;
  if (broadcast) broadcast('pr:updated', updated);

  return updated;
});
```

**Step 2: Run tests to verify they pass**

Run: `npm test --workspace=packages/backend -- --run packages/backend/src/routes/__tests__/pull-requests.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add packages/backend/src/routes/pull-requests.ts packages/backend/src/routes/__tests__/pull-requests.test.ts
git commit -m "feat: add close and reopen PR endpoints with tests"
```

---

### Task 3: Frontend — API Client Methods

**Files:**

- Modify: `packages/frontend/src/api.ts:36` (add after `cancelAgent` in the `prs` object)

**Step 1: Add close and reopen methods**

Add these two methods to the `prs` object in `packages/frontend/src/api.ts`, after the `cancelAgent` method (line 36):

```typescript
close: (id: string) =>
  request<any>(`/prs/${id}/close`, { method: 'POST' }),
reopen: (id: string) =>
  request<any>(`/prs/${id}/reopen`, { method: 'POST' }),
```

**Step 2: Commit**

```bash
git add packages/frontend/src/api.ts
git commit -m "feat: add close/reopen API client methods"
```

---

### Task 4: Frontend — Close/Reopen on PR Detail Page (PRReview.tsx)

**Files:**

- Modify: `packages/frontend/src/pages/PRReview.tsx`

**Step 1: Add close/reopen handler**

Add these handlers after `handleCancelAgent` (around line 218):

```typescript
const handleClosePr = async () => {
  if (!prId) return;
  try {
    const updated = await api.prs.close(prId);
    setPr(updated);
  } catch (err) {
    console.error('Failed to close PR:', err);
    alert('Failed to close PR.');
  }
};

const handleReopenPr = async () => {
  if (!prId) return;
  try {
    const updated = await api.prs.reopen(prId);
    setPr(updated);
  } catch (err) {
    console.error('Failed to reopen PR:', err);
    alert('Failed to reopen PR.');
  }
};
```

**Step 2: Add close/reopen button to the PR header**

In the header section, add a close/reopen button next to the "Comment on PR" button. Find this block (around line 275-287):

```tsx
<div className="flex items-center gap-3">
  <h2 className="text-lg font-semibold">{pr.title}</h2>
  {selectedCycle === 'current' && (
    <button
      onClick={() => setGlobalCommentForm(!globalCommentForm)}
      className="text-xs px-2 py-1 rounded border hover:opacity-80"
      style={{
        borderColor: 'var(--color-border)',
        color: 'var(--color-accent)',
      }}
    >
      Comment on PR
    </button>
  )}
</div>
```

Replace with:

```tsx
<div className="flex items-center gap-3">
  <h2 className="text-lg font-semibold">{pr.title}</h2>
  {selectedCycle === 'current' && (
    <button
      onClick={() => setGlobalCommentForm(!globalCommentForm)}
      className="text-xs px-2 py-1 rounded border hover:opacity-80"
      style={{
        borderColor: 'var(--color-border)',
        color: 'var(--color-accent)',
      }}
    >
      Comment on PR
    </button>
  )}
  {pr.status === 'open' && !agentWorking && (
    <button
      onClick={handleClosePr}
      className="text-xs px-2 py-1 rounded border hover:opacity-80"
      style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
    >
      Close PR
    </button>
  )}
  {pr.status === 'closed' && (
    <button
      onClick={handleReopenPr}
      className="text-xs px-2 py-1 rounded border hover:opacity-80"
      style={{
        borderColor: 'var(--color-border)',
        color: 'var(--color-accent)',
      }}
    >
      Reopen
    </button>
  )}
</div>
```

**Step 3: Commit**

```bash
git add packages/frontend/src/pages/PRReview.tsx
git commit -m "feat: add close/reopen buttons to PR detail page"
```

---

### Task 5: Frontend — Close/Reopen on PR List (ProjectView.tsx)

**Files:**

- Modify: `packages/frontend/src/pages/ProjectView.tsx`

**Step 1: Add close/reopen handlers and update PR card**

Import `api` is already present. Add handlers and modify the PR list items.

Add state updater and handlers after the existing state declarations (around line 10):

The component needs to update the local `prs` state when a PR is closed/reopened. Add handlers inside the component:

```typescript
const handleClosePr = async (e: React.MouseEvent, prId: string) => {
  e.preventDefault(); // Prevent navigating to PR detail
  try {
    const updated = await api.prs.close(prId);
    setPrs((prev) => prev.map((p) => (p.id === prId ? updated : p)));
  } catch (err) {
    console.error('Failed to close PR:', err);
  }
};

const handleReopenPr = async (e: React.MouseEvent, prId: string) => {
  e.preventDefault();
  try {
    const updated = await api.prs.reopen(prId);
    setPrs((prev) => prev.map((p) => (p.id === prId ? updated : p)));
  } catch (err) {
    console.error('Failed to reopen PR:', err);
  }
};
```

Then modify the PR list item. Replace the current `<Link>` block (lines 56-65):

```tsx
<Link
  to={`/prs/${pr.id}`}
  className="block p-4 rounded border hover:border-blue-400 transition-colors"
  style={{
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-bg-secondary)',
  }}
>
  <div className="font-medium">{pr.title}</div>
  <div className="text-sm opacity-70">
    {pr.sourceBranch} &rarr; {pr.baseBranch}
  </div>
</Link>
```

With:

```tsx
<Link
  to={`/prs/${pr.id}`}
  className="block p-4 rounded border hover:border-blue-400 transition-colors"
  style={{
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-bg-secondary)',
  }}
>
  <div className="flex items-center justify-between">
    <div className="font-medium">{pr.title}</div>
    {pr.status === 'open' && (
      <button
        onClick={(e) => handleClosePr(e, pr.id)}
        className="text-xs px-2 py-1 rounded border hover:opacity-80"
        style={{
          borderColor: 'var(--color-border)',
          color: 'var(--color-text)',
        }}
      >
        Close
      </button>
    )}
    {pr.status === 'closed' && (
      <button
        onClick={(e) => handleReopenPr(e, pr.id)}
        className="text-xs px-2 py-1 rounded border hover:opacity-80"
        style={{
          borderColor: 'var(--color-border)',
          color: 'var(--color-accent)',
        }}
      >
        Reopen
      </button>
    )}
  </div>
  <div className="text-sm opacity-70">
    {pr.sourceBranch} &rarr; {pr.baseBranch}
  </div>
</Link>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/pages/ProjectView.tsx
git commit -m "feat: add close/reopen buttons to PR list view"
```

---

### Task 6: Update ReviewBar for Closed State

**Files:**

- Modify: `packages/frontend/src/components/ReviewBar.tsx`

**Step 1: Update the non-open status message**

The ReviewBar currently shows "PR is {prStatus}" for non-open PRs. Update the status display to differentiate closed from approved. Replace the early return block (lines 15-21):

```tsx
if (prStatus !== 'open') {
  return (
    <div
      className="px-6 py-3 border-t text-sm text-center"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-bg-secondary)',
      }}
    >
      PR is {prStatus}
    </div>
  );
}
```

With:

```tsx
if (prStatus !== 'open') {
  return (
    <div
      className="px-6 py-3 border-t text-sm text-center"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-bg-secondary)',
      }}
    >
      This PR has been {prStatus === 'approved' ? 'approved' : 'closed'}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/ReviewBar.tsx
git commit -m "feat: improve ReviewBar status message for closed PRs"
```

---

### Task 7: Build Verification

**Step 1: Run all backend tests**

Run: `npm test --workspace=packages/backend -- --run`
Expected: All tests PASS

**Step 2: Run frontend build**

Run: `npm run build --workspace=packages/frontend`
Expected: Build succeeds with no TypeScript errors

**Step 3: Commit any fixes if needed**
