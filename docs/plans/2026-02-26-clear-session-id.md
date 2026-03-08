# Clear Agent Session ID at Review Submission

## Problem

When a human reviewer submits "Request Changes", the orchestrator automatically resumes the prior Claude Code session via `--resume <sessionId>`. Sometimes the reviewer wants a fresh session instead (e.g., the prior session went off-track, or the problem needs a different approach). There's currently no way to opt out of session resumption.

## Design

Add a "Start fresh session" checkbox to the Request Changes flow. When checked, the backend nulls out `agentSessionId` on the PR before the orchestrator runs. The orchestrator's existing logic already falls back to `startSession()` when there's no session ID.

### API Change

Extend `POST /api/prs/:id/review` request body:

```typescript
{
  action: 'approve' | 'request-changes';
  clearSession?: boolean;  // new, optional
}
```

When `action === 'request-changes'` and `clearSession === true`, set `agentSessionId = null` on the PR row before invoking the orchestrator.

### Frontend Change

In `ReviewBar`, add a checkbox labeled "Start fresh session" that appears only when:

- The PR has an existing `agentSessionId`
- The reviewer is about to submit "Request Changes"

The checkbox value is passed through the `onReview` callback and included in the API request.

### Orchestrator

No changes. The orchestrator already branches on `pr.agentSessionId`:

- If set: `adapter.resumeSession()`
- If null: `adapter.startSession()`

### Scope

- Only `agentSessionId` is cleared, not `agentContext`
- The cleared session ID is not recoverable (acceptable — the session still exists in Claude Code history, just won't be resumed)

## Changes Summary

| Layer    | File                                             | Change                                               |
| -------- | ------------------------------------------------ | ---------------------------------------------------- |
| Backend  | `packages/backend/src/routes/pull-requests.ts`   | Accept `clearSession` field, null out session ID     |
| Frontend | `packages/frontend/src/components/ReviewBar.tsx` | Add checkbox, pass value through                     |
| Frontend | `packages/frontend/src/api.ts`                   | Pass `clearSession` in review request body           |
| Frontend | `packages/frontend/src/pages/PRReview.tsx`       | Thread `agentSessionId` to ReviewBar, update handler |
