# Pull-Based Comment Fetching Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the push-all-comments prompt model with a pull-based approach where agents fetch comments incrementally via CLI, reducing context pollution on large PRs.

**Architecture:** Add query param filtering to the existing comments API, create a new `shepherd review` CLI command group for agents to pull comments on demand, refactor the prompt builder to emit a slim summary instead of full comment bodies, and update the orchestrator to generate that summary.

**Tech Stack:** Fastify (backend routes), Commander.js (CLI), Vitest (tests), TypeScript

---

### Task 1: Add query param filtering to the comments API

**Files:**
- Modify: `packages/backend/src/routes/comments.ts:85-99` (GET endpoint)
- Test: `packages/backend/src/routes/__tests__/comments.test.ts`

**Step 1: Write failing tests for filePath and severity filtering**

Add to `packages/backend/src/routes/__tests__/comments.test.ts`:

```typescript
it('GET /api/prs/:id/comments filters by filePath', async () => {
  await inject({
    method: 'POST',
    url: `/api/prs/${prId}/comments`,
    payload: { filePath: 'src/auth.ts', startLine: 1, endLine: 1, body: 'fix auth', severity: 'must-fix', author: 'human' },
  });
  await inject({
    method: 'POST',
    url: `/api/prs/${prId}/comments`,
    payload: { filePath: 'src/db.ts', startLine: 5, endLine: 5, body: 'fix db', severity: 'suggestion', author: 'human' },
  });

  const filtered = await inject({ method: 'GET', url: `/api/prs/${prId}/comments?filePath=src/auth.ts` });
  expect(filtered.json()).toHaveLength(1);
  expect(filtered.json()[0].body).toBe('fix auth');
});

it('GET /api/prs/:id/comments filters by severity', async () => {
  await inject({
    method: 'POST',
    url: `/api/prs/${prId}/comments`,
    payload: { filePath: 'src/a.ts', startLine: 1, endLine: 1, body: 'must fix this', severity: 'must-fix', author: 'human' },
  });
  await inject({
    method: 'POST',
    url: `/api/prs/${prId}/comments`,
    payload: { filePath: 'src/b.ts', startLine: 1, endLine: 1, body: 'suggestion', severity: 'suggestion', author: 'human' },
  });

  const filtered = await inject({ method: 'GET', url: `/api/prs/${prId}/comments?severity=must-fix` });
  expect(filtered.json()).toHaveLength(1);
  expect(filtered.json()[0].severity).toBe('must-fix');
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --reporter=verbose packages/backend/src/routes/__tests__/comments.test.ts`
Expected: 2 new tests FAIL (filtering not implemented)

**Step 3: Implement filtering in the GET endpoint**

In `packages/backend/src/routes/comments.ts`, update the GET handler (lines 85-99) to parse `filePath` and `severity` query params and filter the results:

```typescript
fastify.get('/api/prs/:prId/comments', async (request) => {
  const { prId } = request.params as { prId: string };
  const { filePath, severity } = request.query as { filePath?: string; severity?: string };

  const cycles = db
    .select()
    .from(schema.reviewCycles)
    .where(eq(schema.reviewCycles.prId, prId))
    .all();

  const cycleIds = cycles.map((c: any) => c.id);
  if (cycleIds.length === 0) return [];

  let comments = db.select().from(schema.comments).where(inArray(schema.comments.reviewCycleId, cycleIds)).all();

  if (filePath) {
    comments = comments.filter((c: any) => c.filePath === filePath);
  }
  if (severity) {
    comments = comments.filter((c: any) => c.severity === severity);
  }

  return comments;
});
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- --reporter=verbose packages/backend/src/routes/__tests__/comments.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add packages/backend/src/routes/comments.ts packages/backend/src/routes/__tests__/comments.test.ts
git commit -m "feat: add filePath and severity query param filtering to comments API"
```

---

### Task 2: Add summary mode to the comments API

**Files:**
- Modify: `packages/backend/src/routes/comments.ts:85-99` (GET endpoint)
- Modify: `packages/backend/src/routes/diff.ts:208-219` (export `extractFilesFromDiff`)
- Test: `packages/backend/src/routes/__tests__/comments.test.ts`

**Step 1: Write failing test for summary mode**

Add to `packages/backend/src/routes/__tests__/comments.test.ts`:

```typescript
it('GET /api/prs/:id/comments?summary=true returns comment stats', async () => {
  await inject({
    method: 'POST',
    url: `/api/prs/${prId}/comments`,
    payload: { filePath: 'src/auth.ts', startLine: 1, endLine: 1, body: 'fix1', severity: 'must-fix', author: 'human' },
  });
  await inject({
    method: 'POST',
    url: `/api/prs/${prId}/comments`,
    payload: { filePath: 'src/auth.ts', startLine: 10, endLine: 10, body: 'fix2', severity: 'request', author: 'human' },
  });
  await inject({
    method: 'POST',
    url: `/api/prs/${prId}/comments`,
    payload: { filePath: 'src/db.ts', startLine: 5, endLine: 5, body: 'suggestion1', severity: 'suggestion', author: 'human' },
  });
  // Add a general (no-file) comment
  await inject({
    method: 'POST',
    url: `/api/prs/${prId}/comments`,
    payload: { body: 'Overall feedback', severity: 'suggestion', author: 'human' },
  });
  // Add a reply (should not count as top-level)
  const parentId = (await inject({ method: 'GET', url: `/api/prs/${prId}/comments` })).json()[0].id;
  await inject({
    method: 'POST',
    url: `/api/prs/${prId}/comments`,
    payload: { filePath: 'src/auth.ts', startLine: 1, endLine: 1, body: 'reply', severity: 'suggestion', author: 'agent', parentCommentId: parentId },
  });

  const response = await inject({ method: 'GET', url: `/api/prs/${prId}/comments?summary=true` });
  const summary = response.json();
  expect(summary.total).toBe(4); // 4 top-level, reply excluded
  expect(summary.bySeverity['must-fix']).toBe(1);
  expect(summary.bySeverity.request).toBe(1);
  expect(summary.bySeverity.suggestion).toBe(2);
  expect(summary.generalCount).toBe(1);
  expect(summary.files).toHaveLength(2);
  expect(summary.files[0].path).toBe('src/auth.ts');
  expect(summary.files[0].count).toBe(2);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --reporter=verbose packages/backend/src/routes/__tests__/comments.test.ts`
Expected: FAIL

**Step 3: Export `extractFilesFromDiff` from diff.ts**

In `packages/backend/src/routes/diff.ts`, change line 208 from:

```typescript
function extractFilesFromDiff(diff: string): string[] {
```

to:

```typescript
export function extractFilesFromDiff(diff: string): string[] {
```

**Step 4: Implement summary mode in the GET endpoint**

Update the GET handler in `packages/backend/src/routes/comments.ts` to check for `summary=true` query param. When set, return aggregated stats instead of raw comments. The summary filters to unresolved top-level comments only (matching what the orchestrator uses). File ordering uses diff file order when a diff snapshot is available, falling back to alphabetical.

```typescript
// Inside the GET handler, after fetching comments:
const { filePath, severity, summary } = request.query as { filePath?: string; severity?: string; summary?: string };

// ... existing filtering code ...

if (summary === 'true') {
  // Filter to unresolved top-level comments only
  const topLevel = comments.filter((c: any) => !c.parentCommentId && !c.resolved);

  const bySeverity: Record<string, number> = {};
  const fileMap = new Map<string, { count: number; bySeverity: Record<string, number> }>();
  let generalCount = 0;

  for (const c of topLevel) {
    bySeverity[c.severity] = (bySeverity[c.severity] || 0) + 1;
    if (!c.filePath) {
      generalCount++;
    } else {
      const entry = fileMap.get(c.filePath) || { count: 0, bySeverity: {} };
      entry.count++;
      entry.bySeverity[c.severity] = (entry.bySeverity[c.severity] || 0) + 1;
      fileMap.set(c.filePath, entry);
    }
  }

  // Try to get diff file ordering from latest cycle's snapshot
  let diffFileOrder: string[] | null = null;
  const latestCycle = cycles.reduce((best: any, c: any) => c.cycleNumber > (best?.cycleNumber ?? 0) ? c : best, null);
  if (latestCycle) {
    const snapshot = db.select().from(schema.diffSnapshots).where(eq(schema.diffSnapshots.reviewCycleId, latestCycle.id)).get();
    if (snapshot) {
      diffFileOrder = extractFilesFromDiff(snapshot.diffData);
    }
  }

  // Order files: diff order first, then remaining alphabetically
  const fileEntries = [...fileMap.entries()];
  if (diffFileOrder) {
    fileEntries.sort((a, b) => {
      const aIdx = diffFileOrder!.indexOf(a[0]);
      const bIdx = diffFileOrder!.indexOf(b[0]);
      if (aIdx === -1 && bIdx === -1) return a[0].localeCompare(b[0]);
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });
  } else {
    fileEntries.sort((a, b) => a[0].localeCompare(b[0]));
  }

  return {
    total: topLevel.length,
    bySeverity,
    files: fileEntries.map(([path, data]) => ({ path, ...data })),
    generalCount,
  };
}
```

Note: Import `extractFilesFromDiff` from `'./diff.js'` and `schema.diffSnapshots` at the top of the file.

**Step 5: Run tests to verify they pass**

Run: `npm test -- --reporter=verbose packages/backend/src/routes/__tests__/comments.test.ts`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add packages/backend/src/routes/comments.ts packages/backend/src/routes/diff.ts packages/backend/src/routes/__tests__/comments.test.ts
git commit -m "feat: add summary mode to comments API with diff file ordering"
```

---

### Task 3: Create the `shepherd review` CLI command

**Files:**
- Create: `packages/cli/src/commands/review.ts`
- Modify: `packages/cli/src/index.ts:1-30` (register new command)

**Step 1: Create the review command**

Create `packages/cli/src/commands/review.ts`:

```typescript
import { Command } from 'commander';
import { ApiClient } from '../api-client.js';

interface CommentSummary {
  total: number;
  bySeverity: Record<string, number>;
  files: Array<{ path: string; count: number; bySeverity: Record<string, number> }>;
  generalCount: number;
}

interface Comment {
  id: string;
  filePath: string | null;
  startLine: number | null;
  endLine: number | null;
  body: string;
  severity: string;
  author: string;
  parentCommentId: string | null;
  resolved: boolean;
}

function formatSummary(summary: CommentSummary, prTitle: string): string {
  const lines: string[] = [];
  lines.push(`# Review Comments for: ${prTitle} (${summary.total} comments)\n`);
  lines.push(`## Summary`);
  for (const [sev, count] of Object.entries(summary.bySeverity)) {
    lines.push(`- ${count} ${sev}`);
  }
  lines.push('');

  if (summary.generalCount > 0) {
    lines.push(`General comments: ${summary.generalCount}`);
    lines.push('');
  }

  if (summary.files.length > 0) {
    lines.push(`## Files (in diff order)`);
    for (let i = 0; i < summary.files.length; i++) {
      const f = summary.files[i];
      const sevParts = Object.entries(f.bySeverity).map(([s, c]) => `${c} ${s}`).join(', ');
      lines.push(`${i + 1}. ${f.path} (${f.count} comments: ${sevParts})`);
    }
  }

  return lines.join('\n');
}

function formatComments(comments: Comment[], heading: string): string {
  // Separate top-level from replies
  const topLevel = comments.filter(c => !c.parentCommentId && !c.resolved);
  const replies = comments.filter(c => c.parentCommentId);

  // Sort top-level: general first, then by line number
  const general = topLevel.filter(c => !c.filePath);
  const withFile = topLevel.filter(c => c.filePath);
  withFile.sort((a, b) => (a.startLine ?? 0) - (b.startLine ?? 0));

  const ordered = [...general, ...withFile];
  const lines: string[] = [];
  lines.push(`# ${heading}\n`);

  for (const c of ordered) {
    const sevLabel = c.severity === 'must-fix' ? 'MUST FIX' : c.severity.toUpperCase();
    let location = '';
    if (c.startLine != null) {
      location = c.startLine === c.endLine ? ` Line ${c.startLine}` : ` Lines ${c.startLine}-${c.endLine}`;
    }
    lines.push(`[${sevLabel}]${location} (comment ID: ${c.id})`);
    lines.push(`> ${c.body}`);

    // Find thread replies for this comment
    const thread = replies.filter(r => r.parentCommentId === c.id);
    if (thread.length > 0) {
      lines.push('Thread:');
      for (const r of thread) {
        lines.push(`  - ${r.author}: ${r.body}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function reviewCommand(program: Command, client: ApiClient) {
  const review = program
    .command('review <pr-id>')
    .description('Review tools for working with PR comments');

  review
    .command('comments')
    .description('Fetch review comments for a PR')
    .option('--summary', 'Show comment counts and file list only')
    .option('--file <path>', 'Filter to comments on a specific file')
    .option('--severity <level>', 'Filter by severity (must-fix, request, suggestion)')
    .option('--all', 'Fetch all comments')
    .action(async (opts: { summary?: boolean; file?: string; severity?: string; all?: boolean }) => {
      const prId = review.args[0];
      const pr = await client.get<{ title: string }>(`/api/prs/${prId}`);

      if (opts.summary) {
        const summary = await client.get<CommentSummary>(`/api/prs/${prId}/comments?summary=true`);
        console.log(formatSummary(summary, pr.title));
        return;
      }

      // Build query params
      const params = new URLSearchParams();
      if (opts.file) params.set('filePath', opts.file);
      if (opts.severity) params.set('severity', opts.severity);
      const qs = params.toString();
      const url = `/api/prs/${prId}/comments${qs ? `?${qs}` : ''}`;

      const comments = await client.get<Comment[]>(url);
      const heading = opts.file
        ? `Comments for: ${opts.file}`
        : opts.severity
          ? `${opts.severity} comments`
          : `All comments`;

      console.log(formatComments(comments, heading));
    });
}
```

**Step 2: Register the command in index.ts**

In `packages/cli/src/index.ts`, add the import and registration:

```typescript
import { reviewCommand } from './commands/review.js';
// ... after other registrations:
reviewCommand(program, client);
```

**Step 3: Build and verify the CLI**

Run: `npm run build --workspace=packages/cli && npx agent-shepherd review --help`
Expected: Shows `review <pr-id>` command with `comments` subcommand

**Step 4: Commit**

```bash
git add packages/cli/src/commands/review.ts packages/cli/src/index.ts
git commit -m "feat: add shepherd review <pr-id> comments CLI command"
```

---

### Task 4: Refactor prompt builder for pull-based model

**Files:**
- Modify: `packages/backend/src/orchestrator/prompt-builder.ts`
- Test: `packages/backend/src/orchestrator/__tests__/prompt-builder.test.ts`

**Step 1: Write failing tests for the new prompt builder interface**

Replace the tests in `packages/backend/src/orchestrator/__tests__/prompt-builder.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildReviewPrompt } from '../prompt-builder.js';

describe('PromptBuilder', () => {
  it('includes comment summary with counts', () => {
    const prompt = buildReviewPrompt({
      prId: 'test-pr-id',
      prTitle: 'Add feature',
      agentContext: '{"summary": "Added auth"}',
      commentSummary: {
        total: 5,
        bySeverity: { 'must-fix': 2, request: 2, suggestion: 1 },
        files: [
          { path: 'src/auth.ts', count: 3, bySeverity: { 'must-fix': 2, request: 1 } },
          { path: 'src/db.ts', count: 1, bySeverity: { suggestion: 1 } },
        ],
        generalCount: 1,
      },
    });

    expect(prompt).toContain('5 comments');
    expect(prompt).toContain('2 must-fix');
    expect(prompt).toContain('src/auth.ts');
    expect(prompt).toContain('src/db.ts');
  });

  it('includes agent context', () => {
    const prompt = buildReviewPrompt({
      prId: 'test-pr-id',
      prTitle: 'PR',
      agentContext: '{"summary": "Built the auth system"}',
      commentSummary: { total: 0, bySeverity: {}, files: [], generalCount: 0 },
    });
    expect(prompt).toContain('Built the auth system');
  });

  it('handles null agent context', () => {
    const prompt = buildReviewPrompt({
      prId: 'test-pr-id',
      prTitle: 'PR',
      agentContext: null,
      commentSummary: { total: 0, bySeverity: {}, files: [], generalCount: 0 },
    });
    expect(prompt).toContain('PR');
    expect(prompt).not.toContain('Context');
  });

  it('includes pull-based workflow instructions', () => {
    const prompt = buildReviewPrompt({
      prId: 'test-pr-id',
      prTitle: 'PR',
      agentContext: null,
      commentSummary: { total: 3, bySeverity: { request: 3 }, files: [{ path: 'src/a.ts', count: 3, bySeverity: { request: 3 } }], generalCount: 0 },
    });

    expect(prompt).toContain('shepherd review');
    expect(prompt).toContain('--file');
    expect(prompt).toContain('shepherd batch');
    expect(prompt).toContain('shepherd ready');
  });

  it('does not include individual comment bodies', () => {
    const prompt = buildReviewPrompt({
      prId: 'test-pr-id',
      prTitle: 'PR',
      agentContext: null,
      commentSummary: {
        total: 1,
        bySeverity: { 'must-fix': 1 },
        files: [{ path: 'src/auth.ts', count: 1, bySeverity: { 'must-fix': 1 } }],
        generalCount: 0,
      },
    });

    // The prompt should NOT contain the literal comment bodies — those come from CLI
    // It should contain the file paths and counts only
    expect(prompt).not.toContain('comment ID:');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --reporter=verbose packages/backend/src/orchestrator/__tests__/prompt-builder.test.ts`
Expected: FAIL (interface changed from `comments` to `commentSummary`)

**Step 3: Rewrite the prompt builder**

Replace `packages/backend/src/orchestrator/prompt-builder.ts` with the new implementation. Keep all the existing skill documentation (severity rules, reply format, common mistakes) but replace the comments section with a summary and update the workflow to describe the pull-based approach.

Key changes:
- `PromptInput.comments: ReviewComment[]` becomes `PromptInput.commentSummary: CommentSummary`
- Remove `ReviewComment` interface, the `formatThread` function, and the entire `## Comments` section builder
- Add `CommentSummary` interface and a `## Comment Summary` section
- Update the `## Step-by-Step Workflow` section to describe: fetch per-file via CLI, make changes, reply incrementally via `shepherd batch`, then `shepherd ready`
- Keep the "IMPORTANT: Read This First" section but update the DO list to include fetching comments via CLI
- Keep severity handling docs, reply format docs, and common mistakes docs

The `CommentSummary` interface:

```typescript
export interface CommentSummary {
  total: number;
  bySeverity: Record<string, number>;
  files: Array<{ path: string; count: number; bySeverity: Record<string, number> }>;
  generalCount: number;
}
```

The summary section in the prompt output should look like:

```
## Comment Summary

5 comments (2 must-fix, 2 request, 1 suggestion) across 2 files

General comments: 1

### Files (in diff order)
1. src/auth.ts (3 comments: 2 must-fix, 1 request)
2. src/db.ts (1 comment: 1 suggestion)
```

The updated workflow section should describe:
1. `shepherd review <pr-id> comments --summary` to confirm what's outstanding
2. Work top-to-bottom through files as listed in the summary
3. For each file: fetch comments with `--file`, read the file, make changes, reply immediately via `shepherd batch`
4. Commit changes after all files are done
5. `shepherd ready <pr-id>` to signal completion
6. Note: if a comment cross-references another file, use `--all` to fetch everything

**Step 4: Run tests to verify they pass**

Run: `npm test -- --reporter=verbose packages/backend/src/orchestrator/__tests__/prompt-builder.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add packages/backend/src/orchestrator/prompt-builder.ts packages/backend/src/orchestrator/__tests__/prompt-builder.test.ts
git commit -m "feat: refactor prompt builder for pull-based comment fetching"
```

---

### Task 5: Update orchestrator to generate comment summary

**Files:**
- Modify: `packages/backend/src/orchestrator/index.ts:49-88` (`handleRequestChanges`)
- Test: `packages/backend/src/orchestrator/__tests__/orchestrator.test.ts`

**Step 1: Write failing test for summary-based prompt building**

Update the test in `packages/backend/src/orchestrator/__tests__/orchestrator.test.ts`. The existing test `'includes unresolved comments from all cycles in the prompt'` calls `buildReviewPrompt` directly with `comments`. Update it to use the new `commentSummary` interface instead. Verify the prompt contains summary stats rather than individual comment bodies.

```typescript
it('includes comment summary in the prompt', async () => {
  const db = (server as any).db;

  // Add comments on cycle 1
  await inject({
    method: 'POST',
    url: `/api/prs/${prId}/comments`,
    payload: { filePath: 'src/index.ts', startLine: 10, endLine: 10, body: 'Fix the null check', severity: 'must-fix', author: 'human' },
  });
  await inject({
    method: 'POST',
    url: `/api/prs/${prId}/comments`,
    payload: { filePath: 'src/auth.ts', startLine: 5, endLine: 5, body: 'Add validation', severity: 'request', author: 'human' },
  });

  // Build summary the way the orchestrator would
  const allCycles = db.select().from(schema.reviewCycles).where(eq(schema.reviewCycles.prId, prId)).all();
  const cycleIds = allCycles.map((c: any) => c.id);
  const allComments = db.select().from(schema.comments).where(inArray(schema.comments.reviewCycleId, cycleIds)).all();
  const topLevel = allComments.filter((c: any) => !c.parentCommentId && !c.resolved);

  const bySeverity: Record<string, number> = {};
  const fileMap = new Map<string, { count: number; bySeverity: Record<string, number> }>();
  let generalCount = 0;
  for (const c of topLevel) {
    bySeverity[c.severity] = (bySeverity[c.severity] || 0) + 1;
    if (!c.filePath) {
      generalCount++;
    } else {
      const entry = fileMap.get(c.filePath) || { count: 0, bySeverity: {} };
      entry.count++;
      entry.bySeverity[c.severity] = (entry.bySeverity[c.severity] || 0) + 1;
      fileMap.set(c.filePath, entry);
    }
  }

  const prompt = buildReviewPrompt({
    prId,
    prTitle: 'Test PR',
    agentContext: null,
    commentSummary: {
      total: topLevel.length,
      bySeverity,
      files: [...fileMap.entries()].map(([path, data]) => ({ path, ...data })),
      generalCount,
    },
  });

  expect(prompt).toContain('2 comments');
  expect(prompt).toContain('src/index.ts');
  expect(prompt).toContain('src/auth.ts');
  expect(prompt).toContain('shepherd review');
  // Should NOT contain the actual comment body text
  expect(prompt).not.toContain('Fix the null check');
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --reporter=verbose packages/backend/src/orchestrator/__tests__/orchestrator.test.ts`
Expected: FAIL (buildReviewPrompt doesn't accept `commentSummary` yet — unless Task 4 is done first)

Note: This test depends on Task 4 being completed first. The `buildReviewPrompt` function must already accept `commentSummary`.

**Step 3: Update `handleRequestChanges` in the orchestrator**

In `packages/backend/src/orchestrator/index.ts`, lines 59-87: replace the code that builds `reviewComments` array with code that builds a `CommentSummary` object instead. Import `CommentSummary` from the prompt builder. The logic is similar to the summary API but done in-process:

```typescript
// Replace lines 59-87 with:
const allCycles = this.db.select().from(this.schema.reviewCycles)
  .where(eq(this.schema.reviewCycles.prId, prId)).all();
const cycleIds = allCycles.map((c: any) => c.id);

const allComments = this.db.select().from(this.schema.comments)
  .where(inArray(this.schema.comments.reviewCycleId, cycleIds)).all();

const topLevel = allComments.filter((c: any) => !c.parentCommentId && !c.resolved);

const bySeverity: Record<string, number> = {};
const fileMap = new Map<string, { count: number; bySeverity: Record<string, number> }>();
let generalCount = 0;

for (const c of topLevel) {
  bySeverity[c.severity] = (bySeverity[c.severity] || 0) + 1;
  if (!c.filePath) {
    generalCount++;
  } else {
    const entry = fileMap.get(c.filePath) || { count: 0, bySeverity: {} };
    entry.count++;
    entry.bySeverity[c.severity] = (entry.bySeverity[c.severity] || 0) + 1;
    fileMap.set(c.filePath, entry);
  }
}

const prompt = buildReviewPrompt({
  prId,
  prTitle: pr.title,
  agentContext: pr.agentContext,
  commentSummary: {
    total: topLevel.length,
    bySeverity,
    files: [...fileMap.entries()].map(([path, data]) => ({ path, ...data })),
    generalCount,
  },
});
```

**Step 4: Update remaining orchestrator tests**

Update the `'excludes resolved comments from the prompt'` test to verify resolved comments don't appear in the summary counts. Update the `'PR stores workingDirectory'` test if it references `buildReviewPrompt` (it doesn't directly, so it should be fine).

**Step 5: Run all tests to verify they pass**

Run: `npm test -- --reporter=verbose packages/backend/src/orchestrator/__tests__/orchestrator.test.ts`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add packages/backend/src/orchestrator/index.ts packages/backend/src/orchestrator/__tests__/orchestrator.test.ts
git commit -m "feat: orchestrator generates comment summary instead of full comment list"
```

---

### Task 6: Run full test suite and fix any breakage

**Files:**
- Potentially any files modified in Tasks 1-5

**Step 1: Run the full test suite**

Run: `npm test`
Expected: All tests PASS

**Step 2: Fix any failures**

If any tests fail (e.g., the e2e workflow test references the old prompt builder interface), update them to use the new `commentSummary` interface.

**Step 3: Build all packages**

Run: `npm run build`
Expected: Clean build with no TypeScript errors

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: update remaining tests for pull-based comment fetching"
```

---

### Task 7: Manual smoke test

**No files to change — verification only.**

**Step 1: Start the server**

Run: `npm run dev`

**Step 2: Create a test project and PR with comments via the API or UI**

Use the web UI or curl to:
1. Create a project
2. Submit a PR
3. Add a few comments across different files with different severities
4. Request changes

**Step 3: Verify the CLI command works**

```bash
shepherd review <pr-id> comments --summary
shepherd review <pr-id> comments --file <some-file>
shepherd review <pr-id> comments --severity must-fix
shepherd review <pr-id> comments --all
```

**Step 4: Verify the agent prompt is slim**

Check that the orchestrator spawned agent receives a prompt with just the summary, not individual comment bodies.
