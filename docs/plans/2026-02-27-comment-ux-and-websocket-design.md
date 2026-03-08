# Comment UX & WebSocket Fixes Design

Date: 2026-02-27

## Overview

Four UX issues to fix: comment counts excluding agent replies, resolved comments not unresolving on reply, confusing edit button placement, and missing WebSocket auto-refresh on the project view page.

## Issue 1: Comment Count Excludes Agent Comments

### Root Cause

`PRReview.tsx:267-274` counts only top-level comments (`!c.parentCommentId && c.filePath`). Agent responses are replies (have `parentCommentId` set), so they're excluded from both the file tree badges and the ReviewBar total.

### Solution

Change both count computations to include all comments (top-level + replies):

**File tree comment counts** (`PRReview.tsx` `commentCounts` memo):

- Count all comments with a `filePath`, regardless of `parentCommentId`

**ReviewBar count** (`PRReview.tsx` line 469):

- Pass total comment count instead of `topLevelComments.length`
- Update ReviewBar label: "X comments" includes all comments and replies

## Issue 2: Reply to Resolved Comment Should Unresolve

### Root Cause

`handleReplyComment` (`PRReview.tsx:155-173`) creates a reply but doesn't update the parent's resolved status. The backend comment creation endpoint has no logic for this either.

### Solution

Handle this in the backend for atomicity. When creating a comment with `parentCommentId` where the parent is resolved, automatically unresolve the parent.

**Changes to `packages/backend/src/routes/comments.ts`:**

In `POST /api/prs/:prId/comments`:

- After inserting the new comment, if `parentCommentId` is provided, look up the parent
- If `parent.resolved === 1` (SQLite stores booleans as integers), update `resolved` to `false`
- Broadcast `comment:updated` for the parent so the frontend picks up the change

In `POST /api/prs/:prId/comments/batch` (replies section):

- Same logic: after inserting a reply, unresolve the parent if it was resolved

**No frontend changes needed.** The existing WebSocket handler for `comment:updated` already refetches comments.

## Issue 3: Edit Button Position

### Root Cause

The parent comment has no inline Edit button. Its Edit button is in the actions bar at the bottom of the entire thread (`CommentThread.tsx:149-156`). After several replies, this button is visually far from the parent text. Replies already have inline Edit buttons (`CommentThread.tsx:107-113`).

### Solution

Move the parent's Edit button from the actions bar to be inline with the parent comment header, matching the reply style.

**Changes to `packages/frontend/src/components/CommentThread.tsx`:**

- Add Edit/Delete buttons to the parent comment header (lines 46-81 area), using the same pattern as reply buttons (lines 107-123)
- Remove Edit and Delete buttons from the actions bar (lines 149-172)
- Keep Reply and Resolve in the actions bar (they apply to the thread, not a specific comment)

## Issue 4: WebSocket Auto-Refresh on Project View

### Root Cause

`ProjectView.tsx` and `Dashboard.tsx` don't use WebSocket. They only fetch data on mount. When a PR is created, its status changes, or the agent completes work, these pages remain stale until manual refresh.

### Solution

Add `useWebSocket` to `ProjectView` to refetch the PR list on relevant events.

**Changes to `packages/frontend/src/pages/ProjectView.tsx`:**

- Import and use `useWebSocket` hook
- On `pr:created`, `pr:updated`, `review:submitted`, `agent:completed`, `agent:error`: refetch PR list
- This covers: new PRs appearing, status changes (approved/closed), and agent completing work

`Dashboard.tsx` is lower priority (projects change rarely) — skip for now.

## Files to Modify

| File                                                 | Changes                                                          |
| ---------------------------------------------------- | ---------------------------------------------------------------- |
| `packages/frontend/src/pages/PRReview.tsx`           | Fix comment count to include replies                             |
| `packages/frontend/src/components/ReviewBar.tsx`     | Update label (no structural change needed)                       |
| `packages/backend/src/routes/comments.ts`            | Auto-unresolve parent on reply (both single and batch endpoints) |
| `packages/frontend/src/components/CommentThread.tsx` | Move Edit/Delete to inline with parent header                    |
| `packages/frontend/src/pages/ProjectView.tsx`        | Add WebSocket listener for auto-refresh                          |

## Deferred Issues

- **Thread indentation past level 1**: Two levels is standard for code review (matches GitHub/GitLab). No change.
- **Line number drift after edits**: Complex line-mapping needed. The inter-cycle diff feature partially mitigates this.
