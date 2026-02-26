# Review Feedback UX Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show agent lifecycle status in the PR review UI so the human knows what's happening after submitting a review, and can cancel a stuck agent.

**Architecture:** Extend `ReviewCycleStatus` with `agent_working` and `agent_error`. The orchestrator persists status transitions to the DB and broadcasts via WebSocket. The frontend derives agent status from the latest cycle's status field. A new cancel-agent endpoint kills the subprocess and resets the cycle.

**Tech Stack:** Fastify, Drizzle ORM, React 19, WebSocket, TypeScript

---

### Task 1: Extend ReviewCycleStatus in shared types

**Files:**
- Modify: `packages/shared/src/types.ts:3-8`

**Step 1: Update the ReviewCycleStatus type**

Change:

```typescript
export type ReviewCycleStatus =
  | 'pending_review'
  | 'in_review'
  | 'changes_requested'
  | 'pending_agent'
  | 'approved';
```

to:

```typescript
export type ReviewCycleStatus =
  | 'pending_review'
  | 'in_review'
  | 'changes_requested'
  | 'agent_working'
  | 'agent_error'
  | 'approved';
```

(Remove `pending_agent` — unused, replaced by `agent_working`.)

**Step 2: Rebuild shared package**

Run: `npm run build --workspace=packages/shared`
Expected: Clean build

**Step 3: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "feat: add agent_working and agent_error to ReviewCycleStatus"
```

---

### Task 2: Orchestrator persists agent status and tracks active sessions

**Files:**
- Modify: `packages/backend/src/orchestrator/index.ts`

**Step 1: Add active sessions map and update handleRequestChanges to persist status**

Replace the full file with:

```typescript
import { eq } from 'drizzle-orm';
import type { AgentAdapter, AgentSession } from './types.js';
import { ClaudeCodeAdapter } from './claude-code-adapter.js';
import { buildReviewPrompt } from './prompt-builder.js';
import { NotificationService } from '../services/notifications.js';

export { buildReviewPrompt } from './prompt-builder.js';
export { ClaudeCodeAdapter } from './claude-code-adapter.js';
export type { AgentAdapter, AgentSession } from './types.js';

interface OrchestratorDeps {
  db: any;
  schema: any;
  broadcast?: (event: string, data: any) => void;
  adapter?: AgentAdapter;
  notificationService?: NotificationService;
}

export class Orchestrator {
  private adapter: AgentAdapter;
  private db: any;
  private schema: any;
  private broadcast?: (event: string, data: any) => void;
  private notificationService: NotificationService;
  private activeSessions = new Map<string, AgentSession>();

  constructor(deps: OrchestratorDeps) {
    this.adapter = deps.adapter || new ClaudeCodeAdapter();
    this.db = deps.db;
    this.schema = deps.schema;
    this.broadcast = deps.broadcast;
    this.notificationService = deps.notificationService || new NotificationService();
  }

  private getLatestCycle(prId: string) {
    const cycles = this.db.select().from(this.schema.reviewCycles).where(eq(this.schema.reviewCycles.prId, prId)).all();
    return cycles.reduce((latest: any, c: any) => (!latest || c.cycleNumber > latest.cycleNumber) ? c : latest, null);
  }

  private setCycleStatus(cycleId: string, status: string) {
    this.db.update(this.schema.reviewCycles)
      .set({ status })
      .where(eq(this.schema.reviewCycles.id, cycleId))
      .run();
  }

  async handleRequestChanges(prId: string) {
    const pr = this.db.select().from(this.schema.pullRequests).where(eq(this.schema.pullRequests.id, prId)).get();
    if (!pr) throw new Error(`PR not found: ${prId}`);

    const project = this.db.select().from(this.schema.projects).where(eq(this.schema.projects.id, pr.projectId)).get();
    if (!project) throw new Error(`Project not found: ${pr.projectId}`);

    const currentCycle = this.getLatestCycle(prId);
    if (!currentCycle) throw new Error(`No review cycle found for PR: ${prId}`);

    // Get current cycle's comments with threads
    const allComments = this.db.select().from(this.schema.comments).where(eq(this.schema.comments.reviewCycleId, currentCycle.id)).all();

    const topLevel = allComments.filter((c: any) => !c.parentCommentId);
    const reviewComments = topLevel.map((c: any) => ({
      id: c.id,
      filePath: c.filePath,
      startLine: c.startLine,
      endLine: c.endLine,
      body: c.body,
      severity: c.severity,
      thread: allComments
        .filter((r: any) => r.parentCommentId === c.id)
        .map((r: any) => ({ author: r.author, body: r.body })),
    }));

    const prompt = buildReviewPrompt({
      prTitle: pr.title,
      agentContext: pr.agentContext,
      comments: reviewComments,
    });

    // Persist agent_working status
    this.setCycleStatus(currentCycle.id, 'agent_working');
    this.broadcast?.('agent:working', { prId });

    // Start or resume agent session
    const sessionMode = pr.agentSessionId ? 'resume' : 'new';

    try {
      const session = sessionMode === 'resume' && pr.agentSessionId
        ? await this.adapter.resumeSession({ sessionId: pr.agentSessionId, projectPath: project.path, prompt })
        : await this.adapter.startSession({ projectPath: project.path, prompt });

      this.activeSessions.set(prId, session);

      session.onComplete(() => {
        this.activeSessions.delete(prId);
        this.broadcast?.('agent:completed', { prId });
        this.notificationService.notifyPRReadyForReview(pr.title, project.name);
      });

      session.onError((error) => {
        this.activeSessions.delete(prId);
        this.setCycleStatus(currentCycle.id, 'agent_error');
        this.broadcast?.('agent:error', { prId, error: error.message });
      });
    } catch (error) {
      this.activeSessions.delete(prId);
      this.setCycleStatus(currentCycle.id, 'agent_error');
      this.broadcast?.('agent:error', { prId, error: (error as Error).message });
    }
  }

  async cancelAgent(prId: string) {
    const session = this.activeSessions.get(prId);
    if (session) {
      await session.kill();
      this.activeSessions.delete(prId);
    }

    const currentCycle = this.getLatestCycle(prId);
    if (currentCycle && currentCycle.status === 'agent_working') {
      this.setCycleStatus(currentCycle.id, 'changes_requested');
    }

    this.broadcast?.('agent:cancelled', { prId });
  }
}
```

**Step 2: Verify backend compiles**

Run: `npx tsc --noEmit -p packages/backend/tsconfig.json 2>&1 | grep -v TS4058`
Expected: No errors (ignoring pre-existing TS4058)

**Step 3: Commit**

```bash
git add packages/backend/src/orchestrator/index.ts
git commit -m "feat: orchestrator persists agent status and tracks active sessions"
```

---

### Task 3: Add cancel-agent endpoint

**Files:**
- Modify: `packages/backend/src/routes/pull-requests.ts`

**Step 1: Add the cancel-agent route**

After the existing `POST /api/prs/:id/review` handler (after line 206), add:

```typescript
  // POST /api/prs/:id/cancel-agent — Cancel a running agent
  fastify.post('/api/prs/:id/cancel-agent', async (request, reply) => {
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

    const orchestrator = (fastify as any).orchestrator;
    if (orchestrator) {
      await orchestrator.cancelAgent(id);
    }

    return { status: 'cancelled' };
  });
```

**Step 2: Verify backend compiles**

Run: `npx tsc --noEmit -p packages/backend/tsconfig.json 2>&1 | grep -v TS4058`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/backend/src/routes/pull-requests.ts
git commit -m "feat: add cancel-agent endpoint"
```

---

### Task 4: Frontend API — Add cancelAgent method

**Files:**
- Modify: `packages/frontend/src/api.ts`

**Step 1: Add cancelAgent to the prs namespace**

After the `review` method (line 34), add:

```typescript
    cancelAgent: (id: string) =>
      request<any>(`/prs/${id}/cancel-agent`, { method: 'POST' }),
```

**Step 2: Commit**

```bash
git add packages/frontend/src/api.ts
git commit -m "feat: add cancelAgent to frontend API client"
```

---

### Task 5: ReviewBar — Disable buttons when agent is working

**Files:**
- Modify: `packages/frontend/src/components/ReviewBar.tsx`

**Step 1: Add agentWorking prop and disable buttons**

Update the component. Change the props interface to add `agentWorking`:

```typescript
interface ReviewBarProps {
  prId: string;
  prStatus: string;
  commentCount: number;
  hasAgentSession: boolean;
  agentWorking: boolean;
  onReview: (action: 'approve' | 'request-changes', opts?: { clearSession?: boolean }) => void;
}
```

Update the destructuring to include `agentWorking`:

```typescript
export function ReviewBar({ prId, prStatus, commentCount, hasAgentSession, agentWorking, onReview }: ReviewBarProps) {
```

Add `disabled` and styling to both buttons. For the Approve button:

```tsx
        <button
          onClick={() => onReview('approve')}
          disabled={agentWorking}
          className="btn-approve px-4 py-1.5 text-sm rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: 'var(--color-btn-approve-bg)', color: 'var(--color-btn-approve-fg)' }}
        >
          Approve
        </button>
```

For the Request Changes button:

```tsx
        <button
          onClick={() => onReview('request-changes', clearSession ? { clearSession: true } : undefined)}
          disabled={agentWorking}
          className="btn-danger px-4 py-1.5 text-sm rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: 'var(--color-btn-danger-bg)', color: 'var(--color-btn-danger-fg)' }}
        >
          Request Changes
        </button>
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/ReviewBar.tsx
git commit -m "feat: disable ReviewBar buttons when agent is working"
```

---

### Task 6: PRReview — Show agent status and wire up WebSocket events

**Files:**
- Modify: `packages/frontend/src/pages/PRReview.tsx`

This is the main integration task. Changes:

1. **Derive agent status from latest cycle** — compute from the `cycles` state
2. **Add WebSocket handlers** for `agent:working`, `agent:completed`, `agent:error`, `agent:cancelled` — all just refetch cycles
3. **Show agent status in the PR header** — below the branch info line
4. **Add cancel handler** — calls `api.prs.cancelAgent`
5. **Pass `agentWorking` prop to ReviewBar**

**Step 1: Add agent error state and cancel handler**

After the existing state declarations (around line 34), add:

```typescript
  const [agentError, setAgentError] = useState<string | null>(null);
```

After `handleReview` (around line 191), add the cancel handler:

```typescript
  const handleCancelAgent = async () => {
    if (!prId) return;
    try {
      await api.prs.cancelAgent(prId);
      await fetchCycles();
    } catch (err) {
      console.error('Failed to cancel agent:', err);
    }
  };
```

**Step 2: Update WebSocket handler**

Update the `useWebSocket` callback to handle agent events and capture error messages. Change the callback from:

```typescript
  const { connected } = useWebSocket((msg) => {
    // Refresh comments on new comment
    if (msg.event === 'comment:added' || msg.event === 'comment:updated') {
      fetchComments();
    }
    // Refresh PR on status change
    if (msg.event === 'review:submitted' || msg.event === 'pr:ready-for-review' || msg.event === 'pr:updated') {
      if (prId) {
        api.prs.get(prId).then(setPr);
        fetchCycles();
      }
    }
  });
```

to:

```typescript
  const { connected } = useWebSocket((msg) => {
    if (msg.event === 'comment:added' || msg.event === 'comment:updated') {
      fetchComments();
    }
    if (msg.event === 'review:submitted' || msg.event === 'pr:ready-for-review' || msg.event === 'pr:updated') {
      if (prId) {
        api.prs.get(prId).then(setPr);
        fetchCycles();
      }
    }
    if (msg.event === 'agent:working' || msg.event === 'agent:completed' || msg.event === 'agent:cancelled') {
      setAgentError(null);
      fetchCycles();
    }
    if (msg.event === 'agent:error') {
      setAgentError(msg.data?.error || 'Unknown error');
      fetchCycles();
    }
  });
```

**Step 3: Compute agent status from cycles**

After the existing `commentCounts` memo (around line 223), add:

```typescript
  const latestCycle = useMemo(() => {
    if (cycles.length === 0) return null;
    return cycles.reduce((latest, c) => c.cycleNumber > latest.cycleNumber ? c : latest, cycles[0]);
  }, [cycles]);

  const agentWorking = latestCycle?.status === 'agent_working';
  const agentErrored = latestCycle?.status === 'agent_error';
```

**Step 4: Add agent status display in the PR header**

After the existing branch info div (the one with `pr.sourceBranch` → `pr.baseBranch`, around line 311), add:

```tsx
        {agentWorking && (
          <div className="flex items-center gap-2 text-sm mt-1">
            <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
            <span style={{ color: 'var(--color-warning, #d29922)' }}>Agent working...</span>
            <button
              onClick={handleCancelAgent}
              className="text-xs px-2 py-0.5 rounded border hover:opacity-80"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              Cancel
            </button>
          </div>
        )}
        {agentErrored && (
          <div className="flex items-center gap-2 text-sm mt-1">
            <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
            <span style={{ color: 'var(--color-danger, #cf222e)' }}>
              Agent error{agentError ? `: ${agentError}` : ''}
            </span>
          </div>
        )}
```

**Step 5: Pass agentWorking to ReviewBar**

Update the ReviewBar JSX from:

```tsx
      <ReviewBar
        prId={prId || ''}
        prStatus={pr.status}
        commentCount={topLevelComments.length}
        hasAgentSession={!!pr.agentSessionId}
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
        agentWorking={agentWorking}
        onReview={handleReview}
      />
```

**Step 6: Verify frontend compiles**

Run: `npm run build --workspace=packages/frontend`
Expected: Clean build

**Step 7: Commit**

```bash
git add packages/frontend/src/pages/PRReview.tsx
git commit -m "feat: show agent status in PR header with cancel support"
```
