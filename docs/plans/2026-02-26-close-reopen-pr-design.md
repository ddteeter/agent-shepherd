# Close/Reopen PR Feature Design

## Summary

Add the ability for humans to close and reopen PRs through dedicated API endpoints and UI controls on both the PR detail page and the PR list view.

## API

Two new endpoints in `packages/backend/src/routes/pull-requests.ts`:

### `POST /api/prs/:id/close`

Sets PR status to `'closed'`.

**Preconditions (all must hold):**
- PR exists (404 if not)
- Current status is `'open'` (400 if already closed or approved)
- No active agent on latest cycle — cycle status is not `'agent_working'` (409 if agent is working)

**On success:**
- Updates PR status to `'closed'`
- Broadcasts `pr:updated` WebSocket event with updated PR data

### `POST /api/prs/:id/reopen`

Sets PR status back to `'open'`.

**Preconditions:**
- PR exists (404 if not)
- Current status is `'closed'` (400 if not closed)

**On success:**
- Updates PR status to `'open'`
- Broadcasts `pr:updated` WebSocket event with updated PR data

## Data Model

No schema changes. `PRStatus = 'open' | 'approved' | 'closed'` already exists in shared types and the database stores status as text.

## State Machine

```
open ──close──> closed
open ──approve─> approved (existing, terminal)
closed ──reopen──> open
```

## Frontend

### PR Detail Page (PRReview.tsx)

- Add "Close PR" button in the header area (separate from ReviewBar)
- When PR is closed, show "Reopen" button instead
- Disable close button if agent is currently working

### PR List (ProjectView.tsx)

- Add action button on each PR card
- Open PRs: "Close" action
- Closed PRs: "Reopen" action

### WebSocket

Use existing `pr:updated` event (no new event types). Frontend already handles this event for real-time updates.

## Error Responses

| Scenario | Status | Message |
|---|---|---|
| Close while agent working | 409 | Agent is currently working. Cancel the agent first. |
| Close already-closed PR | 400 | PR is already closed. |
| Close approved PR | 400 | Cannot close an approved PR. |
| Reopen non-closed PR | 400 | PR is not closed. |

## Out of Scope

- No CLI command (humans close PRs, not agents)
- No close reason or close-with-comment
- No auto-close on merge/timeout
- No orchestrator changes
