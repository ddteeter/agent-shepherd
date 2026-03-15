# Insights Cross-PR Hallucination Fix — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure the comment history API response to group comments by current PR vs. other PRs, preventing the insights agent from conflating cross-PR comments.

**Architecture:** The `/comments/history` endpoint accepts an optional `?currentPrId` query param and returns a `{ currentPr, otherPrs }` grouped structure instead of a flat array. The CLI passes `--pr` to the API. The skill is updated to enforce data boundaries.

**Tech Stack:** Fastify, Drizzle ORM, Commander.js, Vitest

---

### Task 1: Update the Backend Endpoint

**Files:**

- Modify: `packages/backend/src/routes/comments.ts:175-205`

**Step 1: Write the failing test**

Add two tests to `packages/backend/src/routes/__tests__/insights.test.ts`:

```typescript
it('GET /api/projects/:projectId/comments/history with currentPrId groups comments', async () => {
  const pr2Response = await inject({
    method: 'POST',
    url: `/api/projects/${projectId}/prs`,
    payload: { title: 'PR 2', description: 'second', sourceBranch: 'feat/y' },
  });
  const prId2 = jsonBody(pr2Response).id as string;

  await inject({
    method: 'POST',
    url: `/api/prs/${prId}/comments`,
    payload: {
      filePath: 'src/a.ts',
      startLine: 1,
      endLine: 1,
      body: 'Fix in PR1',
      severity: 'must-fix',
      author: 'human',
    },
  });

  await inject({
    method: 'POST',
    url: `/api/prs/${prId2}/comments`,
    payload: {
      filePath: 'src/b.ts',
      startLine: 5,
      endLine: 5,
      body: 'Fix in PR2',
      severity: 'suggestion',
      author: 'human',
    },
  });

  const response = await inject({
    method: 'GET',
    url: `/api/projects/${projectId}/comments/history?currentPrId=${prId}`,
  });
  expect(response.statusCode).toBe(200);

  const body = jsonBody(response);
  expect(body.currentPr).toBeDefined();
  expect((body.currentPr as Record<string, unknown>).prId).toBe(prId);
  expect((body.currentPr as Record<string, unknown>).prTitle).toBe('PR');

  const currentComments = (body.currentPr as Record<string, unknown>)
    .comments as Record<string, unknown>[];
  expect(currentComments).toHaveLength(1);
  expect(currentComments[0].body).toBe('Fix in PR1');

  const otherPrs = body.otherPrs as Record<string, unknown>[];
  expect(otherPrs).toHaveLength(1);
  expect(otherPrs[0].prId).toBe(prId2);
  expect(otherPrs[0].prTitle).toBe('PR 2');

  const otherComments = otherPrs[0].comments as Record<string, unknown>[];
  expect(otherComments).toHaveLength(1);
  expect(otherComments[0].body).toBe('Fix in PR2');
});

it('GET /api/projects/:projectId/comments/history without currentPrId puts all in otherPrs', async () => {
  await inject({
    method: 'POST',
    url: `/api/prs/${prId}/comments`,
    payload: {
      filePath: 'src/a.ts',
      startLine: 1,
      endLine: 1,
      body: 'A comment',
      severity: 'must-fix',
      author: 'human',
    },
  });

  const response = await inject({
    method: 'GET',
    url: `/api/projects/${projectId}/comments/history`,
  });
  expect(response.statusCode).toBe(200);

  const body = jsonBody(response);
  expect(body.currentPr).toBeNull();

  const otherPrs = body.otherPrs as Record<string, unknown>[];
  expect(otherPrs).toHaveLength(1);
  expect(otherPrs[0].prId).toBe(prId);

  const comments = otherPrs[0].comments as Record<string, unknown>[];
  expect(comments).toHaveLength(1);
  expect(comments[0].body).toBe('A comment');
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=packages/backend -- --run src/routes/__tests__/insights.test.ts`
Expected: FAIL — response is a flat array, not the grouped structure.

**Step 3: Update the existing test for the new response shape**

The existing test `GET /api/projects/:projectId/comments/history returns comments across all PRs` (line 118) needs updating to match the new grouped structure. Update it to pass `currentPrId` and assert the grouped format, or remove it since the new tests cover the same ground. Prefer removing it to avoid redundancy.

Also update `returns empty array for project with no PRs` to expect the new shape:

```typescript
it('GET /api/projects/:projectId/comments/history returns grouped structure for empty project', async () => {
  const proj2Response = await inject({
    method: 'POST',
    url: '/api/projects',
    payload: { name: 'empty-project', path: '/tmp/empty' },
  });
  const emptyProjectId = jsonBody(proj2Response).id as string;

  const response = await inject({
    method: 'GET',
    url: `/api/projects/${emptyProjectId}/comments/history`,
  });
  expect(response.statusCode).toBe(200);

  const body = jsonBody(response);
  expect(body.currentPr).toBeNull();
  expect(body.otherPrs).toEqual([]);
});
```

**Step 4: Implement the endpoint changes**

In `packages/backend/src/routes/comments.ts`, replace the handler at line 175-205 with:

```typescript
fastify.get('/api/projects/:projectId/comments/history', (request) => {
  const { projectId } = request.params as { projectId: string };
  const { currentPrId } = request.query as { currentPrId?: string };

  const prs = database
    .select()
    .from(schema.pullRequests)
    .where(eq(schema.pullRequests.projectId, projectId))
    .all();
  const prIds = prs.map((pullRequest) => pullRequest.id);
  if (prIds.length === 0) return { currentPr: null, otherPrs: [] };

  const cycles = database
    .select()
    .from(schema.reviewCycles)
    .where(inArray(schema.reviewCycles.prId, prIds))
    .all();
  const cycleIds = cycles.map((cycle) => cycle.id);
  if (cycleIds.length === 0) return { currentPr: null, otherPrs: [] };

  const allComments = database
    .select()
    .from(schema.comments)
    .where(inArray(schema.comments.reviewCycleId, cycleIds))
    .all();

  const cycleToPr = new Map(cycles.map((cycle) => [cycle.id, cycle.prId]));
  const prTitleMap = new Map(prs.map((pr) => [pr.id, pr.title]));

  const commentsByPr = new Map<string, CommentRow[]>();
  for (const comment of allComments) {
    const commentPrId = cycleToPr.get(comment.reviewCycleId);
    if (!commentPrId) continue;
    const existing = commentsByPr.get(commentPrId) ?? [];
    existing.push(comment);
    commentsByPr.set(commentPrId, existing);
  }

  let currentPr: {
    prId: string;
    prTitle: string;
    comments: CommentRow[];
  } | null = null;
  const otherPrs: { prId: string; prTitle: string; comments: CommentRow[] }[] =
    [];

  for (const [groupPrId, comments] of commentsByPr) {
    const entry = {
      prId: groupPrId,
      prTitle: prTitleMap.get(groupPrId) ?? '',
      comments,
    };
    if (groupPrId === currentPrId) {
      currentPr = entry;
    } else {
      otherPrs.push(entry);
    }
  }

  return { currentPr, otherPrs };
});
```

**Step 5: Run tests to verify they pass**

Run: `npm run test --workspace=packages/backend -- --run src/routes/__tests__/insights.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/backend/src/routes/comments.ts packages/backend/src/routes/__tests__/insights.test.ts
git commit -m "feat: group comment history by current PR vs other PRs (#4)"
```

---

### Task 2: Update the CLI Command

**Files:**

- Modify: `packages/cli/src/commands/insights.ts:59-67`

**Step 1: Update the CLI command to accept `--pr` flag**

```typescript
insights
  .command('history <project-id>')
  .description('Get all comments across PRs for a project')
  .option('--pr <pr-id>', 'Current PR ID to separate from other PRs')
  .action(async (projectId: string, options: { pr?: string }) => {
    const query = options.pr ? `?currentPrId=${options.pr}` : '';
    const result = await client.get<Record<string, unknown>>(
      `/api/projects/${projectId}/comments/history${query}`,
    );
    console.log(JSON.stringify(result, undefined, 2));
  });
```

**Step 2: Run the build to verify it compiles**

Run: `npm run build --workspace=packages/cli`
Expected: Success, no type errors.

**Step 3: Commit**

```bash
git add packages/cli/src/commands/insights.ts
git commit -m "feat: add --pr flag to insights history CLI command (#4)"
```

---

### Task 3: Update the Prompt Builder

**Files:**

- Modify: `packages/backend/src/orchestrator/insights/prompt-builder.ts:51`

**Step 1: Write a test for the updated command hint**

Check if there's an existing test for the prompt builder.

Run: `find packages/backend/src/orchestrator/insights -name '*.test.*'`

If no test exists, add one at `packages/backend/src/orchestrator/insights/__tests__/prompt-builder.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildInsightsPrompt } from '../prompt-builder.js';

describe('buildInsightsPrompt', () => {
  it('includes --pr flag in history command', () => {
    const prompt = buildInsightsPrompt({
      prId: 'pr-123',
      prTitle: 'Test PR',
      branch: 'feat/test',
      projectId: 'proj-456',
      transcriptPaths: [],
    });

    expect(prompt).toContain(
      'agent-shepherd insights history proj-456 --pr pr-123',
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test --workspace=packages/backend -- --run src/orchestrator/insights/__tests__/prompt-builder.test.ts`
Expected: FAIL — current command doesn't include `--pr`.

**Step 3: Update the prompt builder**

In `packages/backend/src/orchestrator/insights/prompt-builder.ts`, change line 51 from:

```typescript
- \`agent-shepherd insights history ${projectId}\` — Get all comments across PRs for pattern detection
```

to:

```typescript
- \`agent-shepherd insights history ${projectId} --pr ${prId}\` — Get comment history grouped by current PR vs. other PRs
```

**Step 4: Run test to verify it passes**

Run: `npm run test --workspace=packages/backend -- --run src/orchestrator/insights/__tests__/prompt-builder.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/backend/src/orchestrator/insights/prompt-builder.ts packages/backend/src/orchestrator/insights/__tests__/prompt-builder.test.ts
git commit -m "feat: include --pr flag in insights prompt builder command hint (#4)"
```

---

### Task 4: Update the Workflow Analyzer Skill

**Files:**

- Modify: `skills/agent-shepherd-workflow-analyzer/SKILL.md`

**Step 1: Update Step 2 (Fetch comment history)**

Replace lines 42-42:

```markdown
2. **Fetch comment history** -- Call `agent-shepherd insights history <project-id>` to get all comments across PRs. Look for recurring themes.
```

with:

```markdown
2. **Fetch comment history** -- Call the `insights history` command from your prompt (it includes the `--pr` flag). The response is grouped:
   - `currentPr.comments` — comments on this PR. Use these for categories 1-4 (CLAUDE.md, skills, prompt engineering, agent behavior).
   - `otherPrs[].comments` — comments on other PRs in this project. Use these ONLY for category 5 (Recurring Pattern Alerts).
```

**Step 2: Update Step 4 (Correlate transcripts with comments)**

Replace lines 46-46:

```markdown
4. **Correlate transcripts with comments** -- For each reviewer comment, trace back to what the agent did and why. Ask: What in the agent's context or instructions caused this behavior?
```

with:

```markdown
4. **Correlate transcripts with comments** -- For each comment in `currentPr.comments`, trace back to what the agent did and why. Ask: What in the agent's context or instructions caused this behavior? Only correlate session transcripts with comments from `currentPr`. Never attribute comments from `otherPrs` to the current PR's agent session.
```

**Step 3: Commit**

```bash
git add skills/agent-shepherd-workflow-analyzer/SKILL.md
git commit -m "docs: clarify cross-PR data boundaries in workflow analyzer skill (#4)"
```

---

### Task 5: Build Verification and Cleanup

**Step 1: Run full build**

Run: `npm run build`
Expected: Success, zero TypeScript errors.

**Step 2: Run full test suite**

Run: `npm run test`
Expected: All tests pass.

**Step 3: Run lint**

Run: `npm run lint`
Expected: No lint errors.
