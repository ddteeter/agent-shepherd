# Comment UX & WebSocket Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 4 UX issues: comment counts, unresolve-on-reply, edit button placement, and WebSocket auto-refresh.

**Architecture:** Frontend-only changes for issues 1, 3, 4. Backend change for issue 2 (auto-unresolve on reply).

**Tech Stack:** React 19, Fastify, Drizzle ORM, WebSocket

---

### Task 1: Fix comment count to include agent replies

**Files:**

- Modify: `packages/frontend/src/pages/PRReview.tsx:267-275` (commentCounts memo)
- Modify: `packages/frontend/src/pages/PRReview.tsx:469` (ReviewBar commentCount prop)

**Step 1: Update file tree comment counts**

In `PRReview.tsx`, change the `commentCounts` memo to count all comments with a `filePath` (not just top-level):

```typescript
const commentCounts = useMemo(() => {
  const counts: Record<string, number> = {};
  for (const c of comments) {
    if (c.filePath) {
      counts[c.filePath] = (counts[c.filePath] || 0) + 1;
    }
  }
  return counts;
}, [comments]);
```

**Step 2: Update ReviewBar comment count**

Change line 469 from:

```typescript
commentCount={topLevelComments.length}
```

to:

```typescript
commentCount={comments.length}
```

**Step 3: Verify**

Run: `npm run build`
Expected: No TypeScript errors.

**Step 4: Commit**

```bash
git add packages/frontend/src/pages/PRReview.tsx
git commit -m "fix: include agent replies in comment counts"
```

---

### Task 2: Auto-unresolve parent comment when reply is added (backend)

**Files:**

- Modify: `packages/backend/src/routes/comments.ts` (POST single comment + POST batch)

**Step 1: Write failing test**

Add a test to `packages/backend/src/routes/__tests__/comments.test.ts`:

```typescript
it('should unresolve parent comment when reply is added', async () => {
  // Setup: create project, PR, cycle, parent comment, resolve it
  // Then: create a reply to the resolved parent
  // Assert: parent comment is now unresolved
});
```

The test should:

1. Create a project, PR, and review cycle
2. Create a top-level comment
3. Resolve it via PUT /api/comments/:id { resolved: true }
4. Create a reply with parentCommentId pointing to the resolved comment
5. Fetch the parent comment and verify resolved === false

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/backend/src/routes/__tests__/comments.test.ts --reporter=verbose`
Expected: FAIL — parent remains resolved after reply.

**Step 3: Implement auto-unresolve in single comment endpoint**

In `packages/backend/src/routes/comments.ts`, in the `POST /api/prs/:prId/comments` handler, after inserting the comment:

```typescript
// Auto-unresolve parent if it was resolved
if (parentCommentId) {
  const parent = db
    .select()
    .from(schema.comments)
    .where(eq(schema.comments.id, parentCommentId))
    .get();
  if (parent && parent.resolved) {
    db.update(schema.comments)
      .set({ resolved: false })
      .where(eq(schema.comments.id, parentCommentId))
      .run();
    const updatedParent = db
      .select()
      .from(schema.comments)
      .where(eq(schema.comments.id, parentCommentId))
      .get();
    const broadcast = (fastify as any).broadcast;
    if (broadcast) broadcast('comment:updated', updatedParent);
  }
}
```

**Step 4: Implement auto-unresolve in batch endpoint**

In the batch endpoint's replies loop, after inserting each reply:

```typescript
// Auto-unresolve parent if resolved
if (parent.resolved) {
  db.update(schema.comments)
    .set({ resolved: false })
    .where(eq(schema.comments.id, r.parentCommentId))
    .run();
  const broadcast = (fastify as any).broadcast;
  if (broadcast) broadcast('comment:updated', parent);
}
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run packages/backend/src/routes/__tests__/comments.test.ts --reporter=verbose`
Expected: PASS

**Step 6: Write batch endpoint test**

Add a test for the batch endpoint:

```typescript
it('should unresolve parent comment when batch reply is added', async () => {
  // Setup: create project, PR, cycle, parent comment, resolve it
  // Then: batch create a reply
  // Assert: parent is now unresolved
});
```

**Step 7: Run all tests**

Run: `npx vitest run packages/backend/src/routes/__tests__/comments.test.ts --reporter=verbose`
Expected: All pass.

**Step 8: Commit**

```bash
git add packages/backend/src/routes/comments.ts packages/backend/src/routes/__tests__/comments.test.ts
git commit -m "fix: auto-unresolve parent comment when reply is added"
```

---

### Task 3: Move Edit/Delete buttons inline with parent comment

**Files:**

- Modify: `packages/frontend/src/components/CommentThread.tsx`

**Step 1: Add inline Edit/Delete to parent comment header**

In `CommentThread.tsx`, add Edit and Delete buttons to the parent comment header div (after the resolved badge, around line 80), using the same pattern as reply buttons:

```tsx
{
  isEditable(comment) && editingId !== comment.id && (
    <button
      onClick={() => setEditingId(comment.id)}
      className="text-xs opacity-50 hover:opacity-100"
    >
      Edit
    </button>
  );
}
{
  isDeletable(comment) && (
    <button
      onClick={() => onDelete!(comment.id)}
      className="text-xs opacity-50 hover:opacity-100"
      style={{ color: 'var(--color-danger)' }}
    >
      Delete
    </button>
  );
}
```

**Step 2: Remove Edit/Delete from actions bar**

Remove the Edit button block (lines 149-156) and Delete button block (lines 165-172) from the actions bar. Keep Reply and Resolve.

The actions bar should only contain:

```tsx
<div className="px-3 py-2 border-t flex gap-2" style={{ borderColor: 'var(--color-border)' }}>
  <button onClick={() => setShowReplyForm(!showReplyForm)} ...>Reply</button>
  {!comment.resolved && (
    <button onClick={() => onResolve(comment.id)} ...>Resolve</button>
  )}
</div>
```

**Step 3: Verify**

Run: `npm run build`
Expected: No TypeScript errors.

**Step 4: Commit**

```bash
git add packages/frontend/src/components/CommentThread.tsx
git commit -m "fix: move edit/delete buttons inline with parent comment header"
```

---

### Task 4: Add WebSocket auto-refresh to ProjectView

**Files:**

- Modify: `packages/frontend/src/pages/ProjectView.tsx`

**Step 1: Add WebSocket listener**

Import `useWebSocket` and add a listener that refetches the PR list on relevant events:

```typescript
import { useWebSocket } from '../hooks/useWebSocket.js';

// Inside component, after the existing useState declarations:
useWebSocket((msg) => {
  if (
    msg.event === 'pr:created' ||
    msg.event === 'pr:updated' ||
    msg.event === 'review:submitted' ||
    msg.event === 'agent:completed' ||
    msg.event === 'agent:error'
  ) {
    if (projectId) {
      api.prs.list(projectId).then(setPrs);
    }
  }
});
```

**Step 2: Verify**

Run: `npm run build`
Expected: No TypeScript errors.

**Step 3: Commit**

```bash
git add packages/frontend/src/pages/ProjectView.tsx
git commit -m "feat: auto-refresh project view via WebSocket events"
```

---

### Task 5: Run full test suite and build

**Step 1: Run all tests**

Run: `npm run test`
Expected: All tests pass (194+ tests across all packages).

**Step 2: Run build**

Run: `npm run build`
Expected: Clean build with no errors.

**Step 3: Final commit if any cleanup needed**
