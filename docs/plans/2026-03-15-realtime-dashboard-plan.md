# Real-time Dashboard Updates Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the project dashboard update in real-time via WebSocket when PRs or projects change.

**Architecture:** Add `useWebSocket` hook to `dashboard.tsx` (matching the existing pattern in `project-view.tsx`), and emit a `project:created` broadcast from the project creation route so new projects appear automatically.

**Tech Stack:** React, Fastify WebSocket, Vitest, Testing Library

---

### Task 1: Backend — Add `project:created` broadcast to project creation route

**Files:**

- Modify: `packages/backend/src/routes/projects.ts:20-45`
- Test: `packages/backend/src/routes/__tests__/projects.test.ts`

**Step 1: Write the failing test**

Add a test to `packages/backend/src/routes/__tests__/projects.test.ts` that verifies `broadcast` is called with `'project:created'` when a project is created. Import `broadcast` from `../../ws.js` and use `vi.mock` to spy on it:

```typescript
import { vi } from 'vitest';
import { broadcast } from '../../ws.js';

vi.mock('../../ws.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../ws.js')>();
  return {
    ...original,
    broadcast: vi.fn(original.broadcast),
  };
});
```

Then add a test:

```typescript
it('POST /api/projects broadcasts project:created', async () => {
  const response = await inject({
    method: 'POST',
    url: '/api/projects',
    payload: { name: 'broadcast-test', path: '/tmp/bt' },
  });
  expect(response.statusCode).toBe(201);
  const body = jsonBody(response);
  expect(broadcast).toHaveBeenCalledWith(
    'project:created',
    expect.objectContaining({
      id: body.id,
      name: 'broadcast-test',
    }),
  );
});
```

**Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/backend -- --run packages/backend/src/routes/__tests__/projects.test.ts`
Expected: FAIL — `broadcast` is not called in the project creation route

**Step 3: Write minimal implementation**

In `packages/backend/src/routes/projects.ts`, add the broadcast call after the project is fetched back from the database in the `POST /api/projects` handler. Add this line after line 42 (after `const project = ...get()`), before the reply:

```typescript
fastify.broadcast('project:created', project);
```

**Step 4: Run test to verify it passes**

Run: `npm test --workspace=packages/backend -- --run packages/backend/src/routes/__tests__/projects.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/backend/src/routes/projects.ts packages/backend/src/routes/__tests__/projects.test.ts
git commit -m "feat(backend): broadcast project:created on project creation (#25)"
```

---

### Task 2: Frontend — Add WebSocket subscription to dashboard

**Files:**

- Modify: `packages/frontend/src/pages/dashboard.tsx`
- Modify: `packages/frontend/src/pages/__tests__/dashboard.test.tsx`

**Step 1: Write the failing test**

In `packages/frontend/src/pages/__tests__/dashboard.test.tsx`, add the `useWebSocket` mock (matching the pattern from `project-view.test.tsx`) and a test that verifies the dashboard refetches when a WebSocket event fires.

Add the mock at the top of the file (after the existing `api` mock):

```typescript
interface WsMessage {
  event: string;
  data: Record<string, unknown>;
}

let dashboardWsCallback: ((message: WsMessage) => void) | undefined;
vi.mock('../../hooks/use-web-socket.js', () => ({
  useWebSocket: vi
    .fn()
    .mockImplementation((callback?: (message: WsMessage) => void) => {
      dashboardWsCallback = callback;
      return { connected: true };
    }),
}));
```

Add a test:

```typescript
it('refetches projects when pr:created WebSocket event fires', async () => {
  mockApi.projects.list.mockResolvedValueOnce([
    {
      id: 'p1',
      name: 'My Project',
      path: '/tmp/p',
      pendingReviewCount: 0,
    },
  ]);
  render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
  await waitFor(() => {
    expect(screen.getByText('My Project')).toBeInTheDocument();
  });

  // Simulate a pr:created event — dashboard should refetch
  mockApi.projects.list.mockResolvedValueOnce([
    {
      id: 'p1',
      name: 'My Project',
      path: '/tmp/p',
      pendingReviewCount: 1,
    },
  ]);
  await act(() => {
    dashboardWsCallback?.({ event: 'pr:created', data: {} });
  });

  await waitFor(() => {
    expect(screen.getByText('1 pending')).toBeInTheDocument();
  });
});
```

Add another test for `project:created`:

```typescript
it('refetches projects when project:created WebSocket event fires', async () => {
  mockApi.projects.list.mockResolvedValueOnce([]);
  render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
  await waitFor(() => {
    expect(screen.getByText(/No projects registered/)).toBeInTheDocument();
  });

  mockApi.projects.list.mockResolvedValueOnce([
    {
      id: 'p1',
      name: 'New Project',
      path: '/tmp/new',
      pendingReviewCount: 0,
    },
  ]);
  await act(() => {
    dashboardWsCallback?.({ event: 'project:created', data: {} });
  });

  await waitFor(() => {
    expect(screen.getByText('New Project')).toBeInTheDocument();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test --workspace=packages/frontend -- --run packages/frontend/src/pages/__tests__/dashboard.test.tsx`
Expected: FAIL — dashboard doesn't use `useWebSocket` yet

**Step 3: Write minimal implementation**

In `packages/frontend/src/pages/dashboard.tsx`:

1. Add import for `useWebSocket`:

```typescript
import { useWebSocket } from '../hooks/use-web-socket.js';
```

2. Add the `useWebSocket` call inside `Dashboard()`, after the existing `useEffect`:

```typescript
useWebSocket((message) => {
  if (
    message.event === 'pr:created' ||
    message.event === 'pr:updated' ||
    message.event === 'review:submitted' ||
    message.event === 'agent:completed' ||
    message.event === 'agent:error' ||
    message.event === 'project:created'
  ) {
    void api.projects.list().then(setProjects);
  }
});
```

**Step 4: Run tests to verify they pass**

Run: `npm test --workspace=packages/frontend -- --run packages/frontend/src/pages/__tests__/dashboard.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/frontend/src/pages/dashboard.tsx packages/frontend/src/pages/__tests__/dashboard.test.tsx
git commit -m "feat(frontend): add WebSocket subscription to dashboard for real-time updates (#25)"
```

---

### Task 3: Verify full build and coverage

**Step 1: Run the full test suite**

Run: `npm test`
Expected: All tests pass

**Step 2: Run coverage check**

Run: `npm run test:coverage`
Expected: Coverage stays above 80% for all packages

**Step 3: Run the build**

Run: `npm run build`
Expected: Clean build, zero TypeScript errors

**Step 4: Run lint**

Run: `npm run lint`
Expected: No lint errors

**Step 5: Final commit (if any formatting changes)**

Only if prettier/lint modified files during the build step.
