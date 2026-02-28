# Agent Workflow Fixes Design

Date: 2026-02-27

## Overview

Three critical bugs in the agent review workflow that break multi-cycle reviews:

1. **Empty prompt on cycle 2+**: Agent receives no review comments in subsequent cycles
2. **Agent status out of sync**: UI shows "working" after agent finishes
3. **No inter-cycle diff view**: Reviewer can't see what changed between cycles

## Issue 1: Empty Prompt on Cycle 2+

### Root Cause

The orchestrator (`packages/backend/src/orchestrator/index.ts:76`) queries comments scoped to only the current review cycle:

```typescript
const allComments = this.db.select().from(this.schema.comments)
  .where(eq(this.schema.comments.reviewCycleId, currentCycle.id)).all();
```

When the human reviews cycle N+1 and replies to comments from cycle N, those replies are stored on cycle N+1 with `parentCommentId` set. The orchestrator finds only these replies (filtered out as non-top-level), while the parent comments from cycle N are excluded entirely. Result: empty prompt.

### Solution

Change the orchestrator to query **all unresolved top-level comments across all cycles** for the PR, with their complete thread history.

**Changes to `packages/backend/src/orchestrator/index.ts`:**

- Import `inArray` from drizzle-orm
- Replace the single-cycle comment query with an all-cycles query
- Filter to `!c.parentCommentId && !c.resolved` for top-level unresolved comments
- Thread replies are gathered from all cycles (any reply matching `parentCommentId`)

**No other changes needed.** Frontend, schema, and API remain unchanged.

## Issue 2: Agent Status Out of Sync

### Root Cause

`session.onComplete()` broadcasts `agent:completed` but does **not** update the review cycle status in the database. The cycle stays in `agent_working` after the agent process exits. The status only changes when the agent calls the `agent-ready` endpoint, which creates a new cycle.

Race condition: The agent typically calls `agent-ready` (HTTP request) before the process exits (`onComplete` fires). But if the agent crashes or doesn't call `agent-ready`, the cycle is stuck in `agent_working` forever.

### Solution

Add `agent_completed` status and update the database in `onComplete`.

**Changes to `packages/shared/src/types.ts`:**

```typescript
export type ReviewCycleStatus =
  | 'pending_review'
  | 'changes_requested'
  | 'agent_working'
  | 'agent_completed'  // NEW
  | 'agent_error'
  | 'approved';
```

**Changes to `packages/backend/src/orchestrator/index.ts` (`onComplete` handler):**

```typescript
session.onComplete(() => {
  this.activeSessions.delete(prId);
  // If agent-ready hasn't already transitioned to a new cycle, update status
  const latestCycle = this.getLatestCycle(prId);
  if (latestCycle && latestCycle.status === 'agent_working') {
    this.setCycleStatus(latestCycle.id, 'agent_completed');
  }
  this.broadcast?.('agent:completed', { prId });
  this.notificationService.notifyPRReadyForReview(pr.title, project.name);
});
```

**Frontend impact:** No changes needed. `agent_completed` is not `agent_working`, so the spinner disappears naturally. The existing WebSocket event handlers already refetch cycles on `agent:completed`.

## Issue 3: Inter-Cycle Diff View

### Root Cause

Each cycle stores a full diff (base branch vs source branch). There is no mechanism to show only what changed between cycles (what the agent actually modified).

### Solution

Store the commit SHA per cycle and add an on-demand inter-cycle diff endpoint.

**Schema change** (`packages/backend/src/db/schema.ts`):

Add `commitSha` column to `reviewCycles`:

```typescript
export const reviewCycles = sqliteTable('review_cycles', {
  // ... existing columns ...
  commitSha: text('commit_sha'),
});
```

**Migration:** `npx drizzle-kit generate --name add_commit_sha_to_review_cycles`

**GitService additions** (`packages/backend/src/services/git.ts`):

```typescript
async getHeadSha(branch: string): Promise<string>
async getDiffBetweenCommits(sha1: string, sha2: string): Promise<string>
```

**SHA capture** (two locations):

1. `POST /api/projects/:projectId/prs` — capture SHA when creating cycle 1
2. `POST /api/prs/:id/agent-ready` — capture SHA when creating new cycle after agent work

**New diff endpoint** — extend `GET /api/prs/:id/diff` with `?from=N&to=M` query params:

- Looks up commit SHAs for cycles N and M
- Returns `git diff <sha_N>..<sha_M>`
- Falls back gracefully if SHAs are missing (old cycles pre-feature)

**Frontend changes** (`packages/frontend/src/pages/PRReview.tsx`):

- When viewing cycle N where N > 1, add an option in the cycle selector: "Changes in cycle N" (shows inter-cycle diff from N-1 to N)
- Standard cycle view continues to show full base-to-source diff

## Files to Modify

| File | Changes |
|------|---------|
| `packages/shared/src/types.ts` | Add `agent_completed` to `ReviewCycleStatus` |
| `packages/backend/src/db/schema.ts` | Add `commitSha` to `reviewCycles` |
| `packages/backend/src/orchestrator/index.ts` | Fix comment query (all cycles, unresolved); update `onComplete` to set status |
| `packages/backend/src/routes/pull-requests.ts` | Capture commit SHA on cycle creation |
| `packages/backend/src/routes/diff.ts` | Add `from`/`to` inter-cycle diff support |
| `packages/backend/src/services/git.ts` | Add `getHeadSha()` and `getDiffBetweenCommits()` |
| `packages/frontend/src/pages/PRReview.tsx` | Add inter-cycle diff option in cycle selector |
| Migration file | Add `commit_sha` column |
