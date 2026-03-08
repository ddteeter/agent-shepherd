# Review Feedback UX Design

## Problem

After clicking "Request Changes", the UI gives no feedback. The human doesn't know if a review was submitted, if an agent was launched, if it's working, or if it failed. If the agent process dies or the server restarts, cycles get stuck in a limbo state with no way to recover.

## Design

### Data Model

Extend `ReviewCycleStatus` with two new states:

```
'pending_review' | 'changes_requested' | 'agent_working' | 'agent_error' | 'approved'
```

Lifecycle:

```
pending_review → changes_requested → agent_working → pending_review (agent completes, calls shepherd ready)
                                                   → agent_error (agent fails)
                                   → approved
```

The cycle status in the DB is the source of truth for agent state. No separate state tracking needed.

### Backend Changes

**Orchestrator** (`orchestrator/index.ts`):

- On `handleRequestChanges`: set latest cycle status to `agent_working` before spawning the agent
- On agent error: set cycle status to `agent_error`
- Track active sessions in a `Map<prId, AgentSession>` for cancellation support

**New endpoint** `POST /api/prs/:id/cancel-agent`:

- Kill the agent subprocess (best-effort via `process.kill()`)
- Set the latest cycle status back to `changes_requested`
- Remove from active sessions map
- If subprocess reference is gone (server restarted), just do the DB update

**Agent-ready endpoint** (`POST /api/prs/:id/agent-ready`):

- Already creates a new cycle with `pending_review` — no change needed

**Review endpoint** (`POST /api/prs/:id/review`):

- Already sets `changes_requested` — no change needed

### Frontend Changes

**PRReview page**:

- Derive agent status from the latest cycle's `status` field (no separate `useState`)
- On WebSocket events (`agent:working`, `agent:completed`, `agent:error`, `review:submitted`, `pr:ready-for-review`), refetch cycles — DB is the source of truth

**PR header area** (below branch info):

- `agent_working`: Show "Agent working..." with a pulsing dot/spinner + "Cancel" button
- `agent_error`: Show "Agent error" in red (with error message if available from WebSocket event data)
- All other states: show nothing

**ReviewBar**:

- Disable Approve and Request Changes buttons when latest cycle status is `agent_working`

**API client**:

- Add `cancelAgent(prId)` method calling the new endpoint

### Recovery from Stuck States

No automatic cleanup, no timeouts. The human decides:

- If agent is still running → wait, it completes normally via `shepherd ready`
- If agent is dead → click "Cancel" to reset cycle to `changes_requested`, then re-submit review
- If server restarted and agent is still alive → agent completes normally via API
- If server restarted and agent is dead → human clicks "Cancel" to unstick

### What We're NOT Building

- No toast/notification system
- No progress percentage or step tracking
- No agent log streaming
- No automatic timeout or startup cleanup
- No retry button (re-submitting the review handles that)

## Changes Summary

| Layer    | File                                             | Change                                                                  |
| -------- | ------------------------------------------------ | ----------------------------------------------------------------------- |
| Shared   | `packages/shared/src/types.ts`                   | Add `agent_working`, `agent_error` to `ReviewCycleStatus`               |
| Backend  | `packages/backend/src/db/schema.ts`              | No change (status is text, not enum)                                    |
| Backend  | `packages/backend/src/orchestrator/index.ts`     | Update cycle status on agent start/error, track active sessions in Map  |
| Backend  | `packages/backend/src/routes/pull-requests.ts`   | Add `POST /api/prs/:id/cancel-agent` endpoint                           |
| Frontend | `packages/frontend/src/api.ts`                   | Add `cancelAgent` method                                                |
| Frontend | `packages/frontend/src/pages/PRReview.tsx`       | Derive agent status from cycle, show in header, handle WebSocket events |
| Frontend | `packages/frontend/src/components/ReviewBar.tsx` | Disable buttons when `agent_working`                                    |
