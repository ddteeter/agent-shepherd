# Clear Agent Session ID — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Start fresh session" checkbox to the Request Changes flow so reviewers can clear the agent session ID and force a new Claude session.

**Architecture:** Extend the existing review submission endpoint to accept a `clearSession` boolean. When set, null out `agentSessionId` before the orchestrator runs. Add a conditional checkbox in the ReviewBar UI.

**Tech Stack:** Fastify (backend), React 19 (frontend), Drizzle ORM, TypeScript

---

### Task 1: Backend — Accept `clearSession` in review endpoint

**Files:**
- Modify: `packages/backend/src/routes/pull-requests.ts:128-198`

**Step 1: Update the request body destructuring and add session clearing logic**

In the `POST /api/prs/:id/review` handler at line 130, change:

```typescript
const { action } = request.body as { action: 'approve' | 'request-changes' };
```

to:

```typescript
const { action, clearSession } = request.body as { action: 'approve' | 'request-changes'; clearSession?: boolean };
```

Then inside the `request-changes` branch (after line 181, before the broadcast), add:

```typescript
      // Clear agent session ID if reviewer wants a fresh session
      if (clearSession) {
        db.update(schema.pullRequests)
          .set({ agentSessionId: null, updatedAt: now })
          .where(eq(schema.pullRequests.id, id))
          .run();
      }
```

**Step 2: Verify backend compiles**

Run: `npm run build --workspace=packages/backend`
Expected: Clean build, no errors

**Step 3: Commit**

```bash
git add packages/backend/src/routes/pull-requests.ts
git commit -m "feat: accept clearSession flag in review endpoint"
```

---

### Task 2: Frontend API — Pass `clearSession` to review request

**Files:**
- Modify: `packages/frontend/src/api.ts:33-34`

**Step 1: Update the review method signature and body**

Change line 33-34 from:

```typescript
    review: (id: string, action: string) =>
      request<any>(`/prs/${id}/review`, { method: 'POST', body: JSON.stringify({ action }) }),
```

to:

```typescript
    review: (id: string, action: string, opts?: { clearSession?: boolean }) =>
      request<any>(`/prs/${id}/review`, { method: 'POST', body: JSON.stringify({ action, ...opts }) }),
```

**Step 2: Commit**

```bash
git add packages/frontend/src/api.ts
git commit -m "feat: pass clearSession option in review API call"
```

---

### Task 3: Frontend ReviewBar — Add "Start fresh session" checkbox

**Files:**
- Modify: `packages/frontend/src/components/ReviewBar.tsx`

**Step 1: Add state and update the component**

Replace the entire file contents with:

```tsx
import { useState } from 'react';

interface ReviewBarProps {
  prId: string;
  prStatus: string;
  commentCount: number;
  hasAgentSession: boolean;
  onReview: (action: 'approve' | 'request-changes', opts?: { clearSession?: boolean }) => void;
}

export function ReviewBar({ prId, prStatus, commentCount, hasAgentSession, onReview }: ReviewBarProps) {
  const [clearSession, setClearSession] = useState(false);

  if (prStatus !== 'open') {
    return (
      <div className="px-6 py-3 border-t text-sm text-center" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
        PR is {prStatus}
      </div>
    );
  }

  return (
    <div className="px-6 py-3 border-t flex items-center justify-between" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
      <span className="text-sm opacity-70">{commentCount} comment{commentCount !== 1 ? 's' : ''}</span>
      <div className="flex items-center gap-3">
        {hasAgentSession && (
          <label className="flex items-center gap-1.5 text-sm cursor-pointer opacity-70 hover:opacity-100">
            <input
              type="checkbox"
              checked={clearSession}
              onChange={(e) => setClearSession(e.target.checked)}
            />
            Start fresh session
          </label>
        )}
        <button
          onClick={() => onReview('approve')}
          className="btn-approve px-4 py-1.5 text-sm rounded font-medium"
          style={{ backgroundColor: 'var(--color-btn-approve-bg)', color: 'var(--color-btn-approve-fg)' }}
        >
          Approve
        </button>
        <button
          onClick={() => onReview('request-changes', clearSession ? { clearSession: true } : undefined)}
          className="btn-danger px-4 py-1.5 text-sm rounded font-medium"
          style={{ backgroundColor: 'var(--color-btn-danger-bg)', color: 'var(--color-btn-danger-fg)' }}
        >
          Request Changes
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/ReviewBar.tsx
git commit -m "feat: add 'Start fresh session' checkbox to ReviewBar"
```

---

### Task 4: Frontend PRReview — Thread props and update handler

**Files:**
- Modify: `packages/frontend/src/pages/PRReview.tsx:186-192` and `342-347`

**Step 1: Update handleReview to accept and forward options**

Change lines 186-192 from:

```typescript
  const handleReview = async (action: 'approve' | 'request-changes') => {
    if (!prId) return;
    await api.prs.review(prId, action);
    // Refresh PR to get updated status
    const updatedPr = await api.prs.get(prId);
    setPr(updatedPr);
  };
```

to:

```typescript
  const handleReview = async (action: 'approve' | 'request-changes', opts?: { clearSession?: boolean }) => {
    if (!prId) return;
    await api.prs.review(prId, action, opts);
    const updatedPr = await api.prs.get(prId);
    setPr(updatedPr);
  };
```

**Step 2: Pass `hasAgentSession` prop to ReviewBar**

Change the ReviewBar JSX from:

```tsx
      <ReviewBar
        prId={prId || ''}
        prStatus={pr.status}
        commentCount={topLevelComments.length}
        onReview={handleReview}
      />
```

to:

```tsx
      <ReviewBar
        prId={prId || ''}
        prStatus={pr.status}
        commentCount={topLevelComments.length}
        hasAgentSession={!!pr.agentSessionId}
        onReview={handleReview}
      />
```

**Step 3: Verify frontend compiles**

Run: `npm run build --workspace=packages/frontend`
Expected: Clean build, no errors

**Step 4: Commit**

```bash
git add packages/frontend/src/pages/PRReview.tsx
git commit -m "feat: thread clearSession option through PRReview to API"
```
