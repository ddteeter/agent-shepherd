# Resubmit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an `agent-shepherd resubmit` command that creates a new review cycle (superseding the current one) when changes are made outside the review UI flow.

**Architecture:** New `superseded` cycle status, new `POST /api/prs/:id/resubmit` endpoint, new CLI command, new skill, and frontend updates to display superseded cycles and smarter inter-cycle diff defaults.

**Tech Stack:** TypeScript, Fastify, Drizzle ORM, React, Commander.js, Claude Code skills

---

### Task 1: Add `superseded` to shared types

**Files:**
- Modify: `packages/shared/src/types.ts:3-10`

**Step 1: Write the failing test**

No test file needed — this is a type-only change. The compiler enforces correctness.

**Step 2: Update `ReviewCycleStatus`**

In `packages/shared/src/types.ts`, add `'superseded'` to the union:

```typescript
export type ReviewCycleStatus =
  | 'pending_review'
  | 'in_review'
  | 'changes_requested'
  | 'agent_working'
  | 'agent_completed'
  | 'agent_error'
  | 'approved'
  | 'superseded';
```

**Step 3: Add `context` to `ReviewCycle` interface**

In `packages/shared/src/types.ts`, add `context` to `ReviewCycle`:

```typescript
export interface ReviewCycle {
  id: string;
  prId: string;
  cycleNumber: number;
  status: ReviewCycleStatus;
  reviewedAt: string | null;
  agentCompletedAt: string | null;
  context: string | null;
}
```

**Step 4: Build to verify types compile**

Run: `npm run build --workspace=packages/shared`
Expected: SUCCESS

**Step 5: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "feat(shared): add superseded status and context field to ReviewCycle type"
```

---

### Task 2: Add `context` column to `review_cycles` DB schema

**Files:**
- Modify: `packages/backend/src/db/schema.ts:26-34`

**Step 1: Add column to schema**

In `packages/backend/src/db/schema.ts`, add `context` to the `reviewCycles` table:

```typescript
export const reviewCycles = sqliteTable('review_cycles', {
  id: text('id').primaryKey(),
  prId: text('pr_id').notNull().references(() => pullRequests.id),
  cycleNumber: integer('cycle_number').notNull(),
  status: text('status').notNull().default('pending_review'),
  reviewedAt: text('reviewed_at'),
  agentCompletedAt: text('agent_completed_at'),
  commitSha: text('commit_sha'),
  context: text('context'),
});
```

**Step 2: Generate migration**

Run: `cd packages/backend && npx drizzle-kit generate --name add_cycle_context`
Expected: New migration file created in `packages/backend/drizzle/`

**Step 3: Build to verify**

Run: `npm run build --workspace=packages/backend`
Expected: SUCCESS

**Step 4: Commit**

```bash
git add packages/backend/src/db/schema.ts packages/backend/drizzle/
git commit -m "feat(backend): add context column to review_cycles table"
```

---

### Task 3: Add `POST /api/prs/:id/resubmit` endpoint — test first

**Files:**
- Modify: `packages/backend/src/routes/__tests__/pull-requests.test.ts`
- Modify: `packages/backend/src/routes/pull-requests.ts`

**Step 1: Write the failing tests**

Add to `packages/backend/src/routes/__tests__/pull-requests.test.ts`:

```typescript
it('POST /api/prs/:id/resubmit supersedes current cycle and creates new one', async () => {
  const create = await inject({
    method: 'POST',
    url: `/api/projects/${projectId}/prs`,
    payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
  });
  const { id } = create.json();

  const response = await inject({
    method: 'POST',
    url: `/api/prs/${id}/resubmit`,
    payload: { context: 'Fixed the auth flow manually in Claude Code' },
  });
  expect(response.statusCode).toBe(200);
  expect(response.json().cycleNumber).toBe(2);
  expect(response.json().status).toBe('pending_review');
  expect(response.json().context).toBe('Fixed the auth flow manually in Claude Code');

  // Check cycles — cycle 1 should be superseded
  const cycles = await inject({
    method: 'GET',
    url: `/api/prs/${id}/cycles`,
  });
  expect(cycles.json()).toHaveLength(2);
  expect(cycles.json()[0].status).toBe('superseded');
  expect(cycles.json()[1].status).toBe('pending_review');
});

it('POST /api/prs/:id/resubmit works regardless of current cycle status', async () => {
  const create = await inject({
    method: 'POST',
    url: `/api/projects/${projectId}/prs`,
    payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
  });
  const { id } = create.json();

  // Request changes (puts cycle in changes_requested)
  await inject({
    method: 'POST',
    url: `/api/prs/${id}/review`,
    payload: { action: 'request-changes' },
  });

  // Resubmit should still work
  const response = await inject({
    method: 'POST',
    url: `/api/prs/${id}/resubmit`,
    payload: { context: 'Took over from agent' },
  });
  expect(response.statusCode).toBe(200);
  expect(response.json().cycleNumber).toBe(2);
});

it('POST /api/prs/:id/resubmit requires context', async () => {
  const create = await inject({
    method: 'POST',
    url: `/api/projects/${projectId}/prs`,
    payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
  });
  const { id } = create.json();

  const response = await inject({
    method: 'POST',
    url: `/api/prs/${id}/resubmit`,
    payload: {},
  });
  expect(response.statusCode).toBe(400);
});

it('POST /api/prs/:id/resubmit returns 404 for nonexistent PR', async () => {
  const response = await inject({
    method: 'POST',
    url: '/api/prs/nonexistent/resubmit',
    payload: { context: 'test' },
  });
  expect(response.statusCode).toBe(404);
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test --workspace=packages/backend -- --grep "resubmit"`
Expected: FAIL — route doesn't exist yet

**Step 3: Implement the endpoint**

Add to `packages/backend/src/routes/pull-requests.ts`, after the `agent-ready` endpoint (after line 308):

```typescript
fastify.post('/api/prs/:id/resubmit', async (request, reply) => {
  const { id } = request.params as { id: string };
  const { context } = request.body as { context?: string };

  if (!context) {
    reply.code(400).send({ error: 'Context is required for resubmit' });
    return;
  }

  const pr = db
    .select()
    .from(schema.pullRequests)
    .where(eq(schema.pullRequests.id, id))
    .get();

  if (!pr) {
    reply.code(404).send({ error: 'Pull request not found' });
    return;
  }

  const latestCycle = getLatestCycle(db, id);
  const now = new Date().toISOString();

  // Mark current cycle as superseded
  if (latestCycle) {
    db.update(schema.reviewCycles)
      .set({ status: 'superseded' })
      .where(eq(schema.reviewCycles.id, latestCycle.id))
      .run();
  }

  // Look up project for git operations
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, pr.projectId))
    .get();

  // Capture commit SHA
  let commitSha: string | null = null;
  if (project) {
    try {
      const gitService = new GitService(project.path);
      commitSha = await gitService.getHeadSha(pr.sourceBranch);
    } catch {
      // Non-fatal
    }
  }

  // Create new review cycle
  const newCycleNumber = (latestCycle?.cycleNumber ?? 0) + 1;
  const newCycleId = randomUUID();
  db.insert(schema.reviewCycles)
    .values({
      id: newCycleId,
      prId: id,
      cycleNumber: newCycleNumber,
      status: 'pending_review',
      commitSha,
      context,
    })
    .run();

  const newCycle = db
    .select()
    .from(schema.reviewCycles)
    .where(eq(schema.reviewCycles.id, newCycleId))
    .get();

  // Store diff snapshot
  if (project) {
    try {
      const gitService = new GitService(project.path);
      const diffData = await gitService.getDiff(pr.baseBranch, pr.sourceBranch);
      db.insert(schema.diffSnapshots)
        .values({
          id: randomUUID(),
          reviewCycleId: newCycleId,
          diffData,
        })
        .run();
    } catch {
      fastify.log.warn({ prId: id }, 'Failed to store diff snapshot for resubmit cycle');
    }
  }

  // Update PR updatedAt
  db.update(schema.pullRequests)
    .set({ updatedAt: now })
    .where(eq(schema.pullRequests.id, id))
    .run();

  const broadcast = (fastify as any).broadcast;
  if (broadcast) broadcast('pr:ready-for-review', { prId: id, cycleNumber: newCycle.cycleNumber });

  const notificationService: NotificationService | undefined =
    (fastify as any).notificationService;
  if (notificationService) {
    notificationService.notifyPRReadyForReview(pr.title, project?.name ?? 'Unknown');
  }

  return newCycle;
});
```

**Step 4: Run tests to verify they pass**

Run: `npm test --workspace=packages/backend -- --grep "resubmit"`
Expected: PASS

**Step 5: Run full backend test suite**

Run: `npm test --workspace=packages/backend`
Expected: PASS (no regressions)

**Step 6: Commit**

```bash
git add packages/backend/src/routes/pull-requests.ts packages/backend/src/routes/__tests__/pull-requests.test.ts
git commit -m "feat(backend): add POST /api/prs/:id/resubmit endpoint"
```

---

### Task 4: Add `resubmit` CLI command

**Files:**
- Create: `packages/cli/src/commands/resubmit.ts`
- Modify: `packages/cli/src/index.ts` (or wherever commands are registered)

**Step 1: Check how commands are registered**

Read `packages/cli/src/index.ts` to see the pattern for registering commands.

**Step 2: Create the resubmit command**

Create `packages/cli/src/commands/resubmit.ts`:

```typescript
import { Command } from 'commander';
import { readFile } from 'fs/promises';
import { ApiClient } from '../api-client.js';

export function resubmitCommand(program: Command, client: ApiClient) {
  program
    .command('resubmit <pr-id>')
    .description('Resubmit a PR after making changes outside the review flow')
    .requiredOption('-c, --context-file <path>', 'Path to context file describing what changed')
    .action(async (prId: string, opts: { contextFile: string }) => {
      const context = await readFile(opts.contextFile, 'utf-8');

      const result = await client.post(`/api/prs/${prId}/resubmit`, { context });
      console.log(`PR resubmitted for review (cycle ${(result as any).cycleNumber})`);
    });
}
```

**Step 3: Register the command**

Add to the command registration file (follow the pattern used by `readyCommand`, `submitCommand`, etc.):

```typescript
import { resubmitCommand } from './commands/resubmit.js';
// ... in the registration section:
resubmitCommand(program, client);
```

**Step 4: Build and verify**

Run: `npm run build --workspace=packages/cli`
Expected: SUCCESS

**Step 5: Verify CLI help**

Run: `agent-shepherd resubmit --help`
Expected: Shows usage with `<pr-id>` and `--context-file` option

**Step 6: Commit**

```bash
git add packages/cli/src/commands/resubmit.ts packages/cli/src/index.ts
git commit -m "feat(cli): add resubmit command"
```

---

### Task 5: Frontend — handle `superseded` status in cycle selector

**Files:**
- Modify: `packages/frontend/src/pages/PRReview.tsx:449-483`

**Step 1: Add superseded label to cycle options**

In `PRReview.tsx`, update the cycle option rendering (around line 453-458) to show superseded status:

```tsx
{cyclesWithSnapshots
  .sort((a, b) => a.cycleNumber - b.cycleNumber)
  .map((cycle) => (
    <option key={cycle.id} value={String(cycle.cycleNumber)}>
      Cycle {cycle.cycleNumber}
      {cycle.status === 'approved' ? ' (approved)' : ''}
      {cycle.status === 'changes_requested' ? ' (changes requested)' : ''}
      {cycle.status === 'superseded' ? ' (superseded)' : ''}
    </option>
  ))
}
```

**Step 2: Update inter-cycle diff to default to last reviewed cycle**

Update the inter-cycle diff section (around lines 460-481). Replace the logic that only shows sequential inter-cycle diffs with logic that also offers "since last reviewed" diffs:

```tsx
{cyclesWithSnapshots.length >= 2 && (
  <>
    <option disabled>───────────</option>
    {(() => {
      const sorted = cyclesWithSnapshots
        .sort((a, b) => a.cycleNumber - b.cycleNumber);
      const options: React.ReactNode[] = [];

      // Sequential inter-cycle diffs
      sorted.slice(1).forEach((cycle) => {
        const prevCycle = sorted.find(
          (c) => c.cycleNumber === cycle.cycleNumber - 1
        );
        if (!prevCycle) return;
        options.push(
          <option
            key={`inter-${prevCycle.cycleNumber}-${cycle.cycleNumber}`}
            value={`inter:${prevCycle.cycleNumber}:${cycle.cycleNumber}`}
          >
            Changes: Cycle {prevCycle.cycleNumber} → {cycle.cycleNumber}
          </option>
        );
      });

      // "Since last reviewed" diffs (skip superseded cycles)
      const reviewedCycles = sorted.filter(
        (c) => c.status !== 'superseded' && c.status !== 'pending_review'
      );
      const latestCycle = sorted[sorted.length - 1];
      if (reviewedCycles.length > 0 && latestCycle) {
        const lastReviewed = reviewedCycles[reviewedCycles.length - 1];
        // Only add if it's different from a sequential diff
        if (lastReviewed.cycleNumber !== latestCycle.cycleNumber - 1) {
          options.push(
            <option
              key={`reviewed-${lastReviewed.cycleNumber}-${latestCycle.cycleNumber}`}
              value={`inter:${lastReviewed.cycleNumber}:${latestCycle.cycleNumber}`}
            >
              Changes: Since last review (Cycle {lastReviewed.cycleNumber} → {latestCycle.cycleNumber})
            </option>
          );
        }
      }

      return options;
    })()}
  </>
)}
```

**Step 3: Verify in browser**

Run: `npm run dev`
Navigate to a PR. Verify:
- Superseded cycles show "(superseded)" label
- Inter-cycle diffs include "Since last review" option when superseded cycles exist
- All existing functionality still works

**Step 4: Commit**

```bash
git add packages/frontend/src/pages/PRReview.tsx
git commit -m "feat(frontend): handle superseded cycles in cycle selector"
```

---

### Task 6: Frontend — show resubmit context on cycle

**Files:**
- Modify: `packages/frontend/src/pages/PRReview.tsx`

**Step 1: Update the ReviewCycle interface in PRReview.tsx**

The local `ReviewCycle` interface (around line 18) needs the `context` field:

```typescript
interface ReviewCycle {
  id: string;
  prId: string;
  cycleNumber: number;
  status: string;
  reviewedAt: string | null;
  agentCompletedAt: string | null;
  hasDiffSnapshot?: boolean;
  context: string | null;
}
```

**Step 2: Display context when viewing a resubmitted cycle**

Add a banner below the cycle selector (or in the diff header area) that shows the resubmit context when the selected cycle has one. Find the snapshot indicator area (around line 510-520) and add context display nearby:

```tsx
{selectedCycleData?.context && (
  <span
    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs"
    style={{
      backgroundColor: 'rgba(59, 130, 246, 0.15)',
      color: 'var(--color-text)',
    }}
  >
    Resubmit context: {selectedCycleData.context.length > 200
      ? selectedCycleData.context.slice(0, 200) + '...'
      : selectedCycleData.context}
  </span>
)}
```

You'll need to compute `selectedCycleData` from the cycles array based on `selectedCycle`:

```typescript
const selectedCycleData = useMemo(() => {
  if (selectedCycle === 'current') return null;
  if (selectedCycle.startsWith('inter:')) return null;
  const num = parseInt(selectedCycle, 10);
  return cycles.find((c) => c.cycleNumber === num) ?? null;
}, [selectedCycle, cycles]);
```

**Step 3: Verify in browser**

Check that resubmit context appears when viewing a cycle that has context.

**Step 4: Commit**

```bash
git add packages/frontend/src/pages/PRReview.tsx
git commit -m "feat(frontend): display resubmit context on cycle"
```

---

### Task 7: Create `agent-shepherd:resubmit-pr` skill

**Files:**
- Create: `skills/agent-shepherd-resubmit-pr/SKILL.md`

**Step 1: Create skill directory**

Run: `mkdir -p skills/agent-shepherd-resubmit-pr`

**Step 2: Write the skill**

Create `skills/agent-shepherd-resubmit-pr/SKILL.md`:

```markdown
---
name: agent-shepherd:resubmit-pr
description: Use when resubmitting a PR for review after making changes outside the Agent Shepherd review flow. Guides context generation and the agent-shepherd resubmit workflow.
---

# Skill: Resubmit a PR via Agent Shepherd

## When to Use

Use this skill when changes have been made to a PR branch outside the normal Agent Shepherd review flow — for example, when working directly in Claude Code without going through "Request Changes." This creates a new review cycle so the human can review the updated code.

## Prerequisites

- The Agent Shepherd backend must be running (default: `http://localhost:3847`)
- The PR must already exist in Agent Shepherd (was previously submitted with `agent-shepherd submit`)
- Changes must be committed to the branch

## Step-by-Step Workflow

### 1. Ensure All Changes Are Committed

The diff is computed from git. Uncommitted changes will not appear in the review.

```bash
git status
git add <files...>
git commit -m "description of changes"
```

### 2. Find the PR ID

If you don't know the PR ID, find it:

```bash
agent-shepherd list-projects
# Then check the web UI or use the project ID to find the PR
```

### 3. Generate a Context File

Create a file (e.g., `resubmit-context.json`) that describes what changed and why. Analyze the diff and recent commits to build this context.

To understand what changed since the last cycle, review:
- `git log --oneline` for recent commits
- `git diff` against the base branch
- Any relevant discussion or decisions that led to the changes

Write a JSON file:

```json
{
  "summary": "What changed at a high level and why these changes were made outside the review flow.",
  "changesFromPreviousCycle": [
    "Describe each significant change relative to what was previously submitted.",
    "Focus on what a reviewer needs to know to understand the delta."
  ],
  "reasonForDirectChanges": "Why these changes were made directly rather than through the review flow (e.g., 'Iterated on the implementation in Claude Code based on initial testing').",
  "unresolvedFromPreviousCycle": [
    "Note any unresolved comments from previous cycles that these changes address.",
    "Or note that previous comments are still unresolved and need review."
  ]
}
```

### 4. Resubmit

```bash
agent-shepherd resubmit <pr-id> --context-file resubmit-context.json
```

This will:
- Mark the current cycle as `superseded`
- Create a new cycle with a fresh diff snapshot
- Store the context for the reviewer

### 5. Clean Up

Remove the temporary context file:

```bash
rm resubmit-context.json
```

### 6. Verify

```bash
agent-shepherd status <pr-id>
```

Confirm the new cycle was created and the PR is ready for review.
```

**Step 3: Link the skill**

Run: `npm run link-skills`

**Step 4: Verify skill is available**

Run: `ls -la ~/.claude/skills/ | grep resubmit`
Expected: Symlink pointing to the new skill directory

**Step 5: Commit**

```bash
git add skills/agent-shepherd-resubmit-pr/
git commit -m "feat(skill): add agent-shepherd:resubmit-pr skill"
```

---

### Task 8: Update README and CLAUDE.md

**Files:**
- Modify: `README.md` (already partially updated during design — verify and finalize)
- Modify: `CLAUDE.md` (add resubmit to CLI usage if documented there)

**Step 1: Verify README changes**

Read `README.md` and verify the "Outside of Agent Shepherd Changes" section is accurate given the implementation. Update the CLI Usage table to include `resubmit`:

```markdown
agent-shepherd resubmit <prId> -c <context>  # Resubmit PR with new cycle
```

**Step 2: Update skill table in README**

Add the new skill to the skills table in README:

```markdown
| `agent-shepherd:resubmit-pr` | Guides agents through context generation and the resubmit workflow for changes made outside the review flow |
```

**Step 3: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: add resubmit command and skill to README"
```

---

### Task 9: Final verification

**Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 2: Build all packages**

Run: `npm run build`
Expected: SUCCESS

**Step 3: Manual smoke test**

1. Start the server: `npm run dev`
2. Register a project: `agent-shepherd init .`
3. Submit a PR: `agent-shepherd submit -p <id> -t "Test PR"`
4. Make a change and commit it
5. Create a context file and resubmit: `agent-shepherd resubmit <prId> -c resubmit-context.json`
6. Verify in UI:
   - Cycle 1 shows as "superseded"
   - Cycle 2 shows as "pending_review" with context
   - Inter-cycle diff options include "Since last review" when applicable
   - All comments from cycle 1 are still visible
