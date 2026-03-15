# Question Comment Type Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `question` comment type, rename `severity` → `type` across the codebase, and filter insights history by configurable ignored types.

**Architecture:** Rename the shared `CommentSeverity` type to `CommentType`, add `question` as a value, migrate the DB column, update all consumers (backend routes, prompt builder, frontend, CLI), and add config-driven filtering to the insights history endpoint.

**Tech Stack:** TypeScript, Drizzle ORM (SQLite), Fastify, React 19, Tailwind CSS 4, Commander.js, Vitest

**Spec:** `docs/plans/2026-03-14-question-comment-type-design.md`

---

## Chunk 1: Shared Types, DB Schema, and Backend Core

### Task 1: Rename CommentSeverity → CommentType and add `question` in shared types

**Files:**

- Modify: `packages/shared/src/types.ts:13,56,82,87,109,110,119`
- Modify: `packages/shared/src/__tests__/types.test.ts:6,28-29`

- [ ] **Step 1: Update the shared type definition**

In `packages/shared/src/types.ts`, make these changes:

Line 13 — rename type and add `question`:

```typescript
export type CommentType = 'question' | 'suggestion' | 'request' | 'must-fix';
```

Line 56 — rename field in `Comment` interface:

```typescript
type: CommentType;
```

Lines 82, 87 — rename field in `BatchCommentPayload`:

```typescript
type?: CommentType;
```

Lines 109-110 — rename fields in `CommentSummary`:

```typescript
byType: Record<string, number>;
files: {
  path: string;
  count: number;
  byType: Record<string, number>;
}
[];
```

Line 119 — rename field in `CreateCommentInput`:

```typescript
type?: CommentType;
```

- [ ] **Step 2: Update the shared types test**

In `packages/shared/src/__tests__/types.test.ts`:

Update the import (line 6) from `CommentSeverity` to `CommentType`.

Update the test (lines 28-29):

```typescript
it('CommentType has correct values', () => {
  const types: CommentType[] = [
    'question',
    'suggestion',
    'request',
    'must-fix',
  ];
  expect(types).toHaveLength(4);
});
```

- [ ] **Step 3: Build shared package and run test**

Run: `npm run build --workspace=packages/shared && npm run test --workspace=packages/shared`
Expected: Build succeeds, test passes.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/
git commit -m "feat: rename CommentSeverity to CommentType and add question (#8)"
```

---

### Task 2: Database migration and schema update

**Files:**

- Modify: `packages/backend/src/db/schema.ts:61`
- Create: migration file via `drizzle-kit generate`

- [ ] **Step 1: Update the schema definition**

In `packages/backend/src/db/schema.ts`, line 61:

```typescript
type: text('type').notNull().default('suggestion'),
```

- [ ] **Step 2: Generate migration**

Run: `cd packages/backend && npx drizzle-kit generate --name rename-severity-to-type`

This should produce a migration with:

```sql
ALTER TABLE comments RENAME COLUMN severity TO type;
```

- [ ] **Step 3: Verify the migration SQL**

Read the generated migration file and confirm it contains only the column rename. If Drizzle generates a destructive recreate-table migration instead, replace the content with the simple `ALTER TABLE` statement.

- [ ] **Step 4: Commit**

Note: The full backend build will fail at this point because other files still reference `schema.comments.severity`. That's expected — Tasks 3-5 will fix all consumers.

```bash
git add packages/backend/src/db/schema.ts packages/backend/drizzle/
git commit -m "feat: rename severity column to type in comments table (#8)"
```

---

### Task 3: Update backend comments route (rename + insights filtering)

**Files:**

- Modify: `packages/backend/src/routes/comments.ts:33,36,41,46,49-50,76,80,132,146,163-166,214,237,277-279,297,366,399`
- Modify: `packages/backend/src/server.ts:28-36` (add ConfigService to Fastify type declaration)

- [ ] **Step 1: Write the insights history filtering test**

In `packages/backend/src/routes/__tests__/insights.test.ts`, add a new test after the existing `'GET /api/projects/:projectId/comments/history returns comments across all PRs'` test:

The test should follow the existing test patterns in this file (which already set up projects, PRs, review cycles, and comments). Implement a test that:

1. Creates a project, PR, review cycle, and three comments with types `question`, `suggestion`, and `must-fix`
2. Calls `GET /api/projects/:projectId/comments/history`
3. Asserts the response has length 2 (question excluded)
4. Asserts the response contains the `suggestion` and `must-fix` comments but NOT the `question` comment

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test --workspace=packages/backend -- --grep "filters out insightsIgnoredTypes"`
Expected: FAIL

- [ ] **Step 3: Rename all `severity` references to `type` in comments.ts**

In `packages/backend/src/routes/comments.ts`, rename all occurrences:

In `buildCommentSummary()` (lines 33-80):

- `bySeverity` → `byType` (lines 33, 36, 41, 46, 49-50, 76, 80)
- `comment.severity` → `comment.type` (lines 41, 49)

In `getCommentSummary()` (line 132):

- `bySeverity: {}` → `byType: {}`

In `getFilteredComments()` (lines 142-170):

- Parameter `severity` → `type` (line 146)
- `comment.severity` → `comment.type` (line 165)
- Variable reference (line 163)

In `POST /api/prs/:prId/comments` (lines 207-273):

- Destructure `type` instead of `severity` (line 214)
- `severity: severity ?? 'suggestion'` → `type: type ?? 'suggestion'` (line 237)

In `GET /api/prs/:prId/comments` (lines 275-299):

- Query param `severity` → `type` (lines 277-279)
- Pass `type` to `getFilteredComments` (line 297)

In `POST /api/prs/:prId/comments/batch` (lines 341-429):

- `comment.severity` → `comment.type` (line 366)
- `replyItem.severity` → `replyItem.type` (line 399)

- [ ] **Step 4: Add ConfigService to Fastify instance**

In `packages/backend/src/server.ts`, add to the `FastifyInstance` declaration (around line 30):

```typescript
import { ConfigService } from './services/config.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: AppDatabase;
    sqlite: DatabaseType;
    sessionToken: string;
    broadcast: typeof broadcast;
    orchestrator?: Orchestrator;
    notificationService: NotificationService;
    configService: ConfigService;
  }
}
```

Then in the server setup (where `fastify.decorate('db', db)` is called), add:

```typescript
const globalConfigPath = path.join(homedir(), '.agent-shepherd', 'config.yml');
const configService = new ConfigService(db, globalConfigPath);
fastify.decorate('configService', configService);
```

Note: `homedir` and `path` are already imported in `server.ts`.

- [ ] **Step 5: Add insights filtering to the history endpoint**

In `packages/backend/src/routes/comments.ts`, update the history endpoint (lines 175-205):

```typescript
fastify.get('/api/projects/:projectId/comments/history', (request) => {
  const { projectId } = request.params as { projectId: string };

  const project = database
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();

  // Read ignored types from config
  let ignoredTypes: string[] = ['question'];
  if (project) {
    const config = fastify.configService.getMergedProjectConfig(
      projectId,
      project.path,
    );
    const configValue = config.insightsIgnoredTypes;
    if (configValue !== undefined) {
      if (Array.isArray(configValue)) {
        ignoredTypes = configValue as string[];
      } else if (typeof configValue === 'string') {
        ignoredTypes = JSON.parse(configValue) as string[];
      }
    }
  }

  const prs = database
    .select()
    .from(schema.pullRequests)
    .where(eq(schema.pullRequests.projectId, projectId))
    .all();
  const prIds = prs.map((pullRequest) => pullRequest.id);
  if (prIds.length === 0) return [];

  const cycles = database
    .select()
    .from(schema.reviewCycles)
    .where(inArray(schema.reviewCycles.prId, prIds))
    .all();
  const cycleIds = cycles.map((cycle) => cycle.id);
  if (cycleIds.length === 0) return [];

  const allComments = database
    .select()
    .from(schema.comments)
    .where(inArray(schema.comments.reviewCycleId, cycleIds))
    .all();

  const cycleToPr = new Map(cycles.map((cycle) => [cycle.id, cycle.prId]));
  return allComments
    .filter((comment) => !ignoredTypes.includes(comment.type))
    .map((comment) => ({
      ...comment,
      prId: cycleToPr.get(comment.reviewCycleId),
    }));
});
```

Note: `schema.projects` needs to be available — verify it's accessible via the existing `schema` import.

- [ ] **Step 6: Run the insights filtering test**

Run: `npm run test --workspace=packages/backend -- --grep "filters out insightsIgnoredTypes"`
Expected: PASS

- [ ] **Step 7: Update existing comment route tests**

In `packages/backend/src/routes/__tests__/comments.test.ts`:

- Rename all `severity` references to `type` in test data and assertions
- Update the test `'GET /api/prs/:id/comments filters by severity'` to `'GET /api/prs/:id/comments filters by type'`
- Update query param from `?severity=must-fix` to `?type=must-fix`
- Add a test that creates a `question` type comment and verifies it's stored correctly

In `packages/backend/src/routes/__tests__/comments-extra.test.ts`:

- Rename all `severity` references to `type`

In `packages/backend/src/routes/__tests__/insights.test.ts`:

- Rename `severity` references to `type` in existing test data

- [ ] **Step 8: Run all backend tests**

Run: `npm run test --workspace=packages/backend`
Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add packages/backend/src/routes/comments.ts packages/backend/src/server.ts packages/backend/src/routes/__tests__/
git commit -m "feat: rename severity to type in comments route and add insights filtering (#8)"
```

---

### Task 4: Update review prompt builder

**Files:**

- Modify: `packages/backend/src/orchestrator/review/prompt-builder.ts:50,57,68,77-119,195`
- Modify: `packages/backend/src/orchestrator/review/__tests__/prompt-builder.test.ts`

- [ ] **Step 1: Update prompt builder test fixtures**

In `packages/backend/src/orchestrator/review/__tests__/prompt-builder.test.ts`:

- Rename all `bySeverity` to `byType` in test fixtures
- Add an assertion that the output contains the `question` type section
- Add an assertion that the heading says "Comment Types" not "Severity Levels"

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=packages/backend -- --grep "prompt-builder"`
Expected: FAIL

- [ ] **Step 3: Update the prompt builder code**

In `packages/backend/src/orchestrator/review/prompt-builder.ts`:

Rename variables (lines 50, 68):

- `severityParts` → `typeParts`
- `fileSeverityParts` → `fileTypeParts`
- `commentSummary.bySeverity` → `commentSummary.byType` (lines 50, 68)
- `f.bySeverity` → `f.byType` (line 68)

Update the skill section heading (line 77 area):

```
## Comment Types and How to Handle Them
```

(was "Severity Levels and How to Handle Them")

Add the `question` section AFTER `suggestion` (append after the suggestion section ends, around line 119). The existing order is highest-urgency first (`must-fix` → `request` → `suggestion`), so `question` goes last:

```markdown
### \`question\`

**Action:** Answer the question. If it reveals an actual issue, fix it.

The reviewer is asking for clarification or exploring whether something is a problem. Answer the question directly. If your answer reveals that there IS an issue worth fixing, go ahead and fix it. If not, just reply with your answer — no code changes needed.

Reply example (no issue): "The retry logic caps at 3 attempts because the upstream API rate-limits after 5 calls per second. The exponential backoff ensures we stay under that limit."

Reply example (issue found): "Good question — looking at this, the timeout is actually never reset after a successful retry, which means subsequent requests inherit the extended timeout. Fixed by resetting \`timeoutMs\` after line 84."
```

Update the batch JSON example (around line 195):

- `"severity": "suggestion"` → `"type": "suggestion"`

Rename all other occurrences of the word "severity" in the prompt text to "type" where it refers to the comment field. Be careful not to change instances where "severity" is used in natural language (e.g., "severity of the issue") — only rename references to the field/property name.

- [ ] **Step 4: Run prompt builder tests**

Run: `npm run test --workspace=packages/backend -- --grep "prompt-builder"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/orchestrator/review/
git commit -m "feat: add question type to review prompt and rename severity to type (#8)"
```

---

### Task 5: Update remaining backend test files

**Files:**

- Modify: `packages/backend/src/__tests__/end-to-end-workflow.test.ts`
- Modify: `packages/backend/src/orchestrator/__tests__/orchestrator.test.ts`
- Modify: `packages/backend/src/orchestrator/__tests__/feedback-integrator.test.ts`

- [ ] **Step 1: Update end-to-end workflow test**

In `packages/backend/src/__tests__/end-to-end-workflow.test.ts`:

- Rename all `severity` field references to `type` in test data and assertions
- Rename all `bySeverity` references to `byType`

- [ ] **Step 2: Update orchestrator test**

In `packages/backend/src/orchestrator/__tests__/orchestrator.test.ts`:

- Rename all `bySeverity` references to `byType`

- [ ] **Step 3: Update feedback integrator test**

In `packages/backend/src/orchestrator/__tests__/feedback-integrator.test.ts`:

- Rename all `severity` references to `type`

- [ ] **Step 4: Run all backend tests**

Run: `npm run test --workspace=packages/backend`
Expected: All tests pass.

- [ ] **Step 5: Build backend**

Run: `npm run build --workspace=packages/backend`
Expected: Zero TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/__tests__/ packages/backend/src/orchestrator/__tests__/
git commit -m "test: update remaining backend tests for severity to type rename (#8)"
```

---

## Chunk 2: Frontend, CLI, and Final Verification

### Task 6: Update frontend — CSS, components, and pages

**Files:**

- Modify: `packages/frontend/src/index.css:14,45` (add `--color-question`)
- Modify: `packages/frontend/src/api.ts:46`
- Modify: `packages/frontend/src/components/comment-thread.tsx:12,30-34,136-137,140`
- Modify: `packages/frontend/src/components/comment-form.tsx:4,21,28,58`
- Modify: `packages/frontend/src/components/diff-viewer.tsx:41,309,322,384-385,541,547,1046,1048,1056,1062,1070,1076,1182-1183`
- Modify: `packages/frontend/src/pages/pr-review.tsx:295,304,323`

- [ ] **Step 1: Add `--color-question` CSS custom property**

In `packages/frontend/src/index.css`:

After line 14 (`--color-danger`), add:

```css
--color-question: #8250df;
```

After line 45 (`--color-danger` in dark theme), add:

```css
--color-question: #bc8cff;
```

- [ ] **Step 2: Update comment-thread.tsx**

In `packages/frontend/src/components/comment-thread.tsx`:

Line 12 — rename field in interface:

```typescript
type: string;
```

Lines 30-34 — rename map and add `question`:

```typescript
const typeColors: Record<string, string> = {
  question: 'var(--color-question)',
  suggestion: 'var(--color-accent)',
  request: 'var(--color-warning)',
  'must-fix': 'var(--color-danger)',
};
```

Lines 136-137 — update references:

```typescript
backgroundColor: `color-mix(in srgb, ${typeColors[comment.type] ?? 'gray'} 15%, transparent)`,
color: typeColors[comment.type] ?? 'gray',
```

Line 140 — update display text:

```tsx
{
  comment.type;
}
```

- [ ] **Step 3: Update comment-form.tsx**

In `packages/frontend/src/components/comment-form.tsx`:

Rename all `severity` references to `type`:

- Callback parameter type (line 4): `{ body: string; type?: string }`
- State variable (line 21): `const [type, setType] = useState(defaultType);`
- Prop name: `defaultSeverity` → `defaultType`
- Submit call (line 28): `onSubmit({ body, type: isReply || isEditing ? undefined : type });`
- Form binding (line 58): `value={type}` and `onChange` handler uses `setType`
- Label text: `"Type:"` instead of `"Severity:"`

Add `question` as the first option in the select dropdown:

```tsx
<option value="question">Question</option>
<option value="suggestion">Suggestion</option>
<option value="request">Request</option>
<option value="must-fix">Must Fix</option>
```

- [ ] **Step 4: Update diff-viewer.tsx**

In `packages/frontend/src/components/diff-viewer.tsx`:

- Rename all `severity` field references to `type` in the local Comment interface and handler types
- Rename handler parameters and property accesses from `severity` to `type`

- [ ] **Step 5: Update pr-review.tsx**

In `packages/frontend/src/pages/pr-review.tsx`:

- Rename `severity` field references to `type` (lines 295, 304, 323)
- Default value `'suggestion'` remains unchanged

- [ ] **Step 6: Update api.ts**

In `packages/frontend/src/api.ts`, line 46:

```typescript
type: string;
```

- [ ] **Step 7: Update frontend tests**

In `packages/frontend/src/components/__tests__/comment-form.test.tsx`:

- Rename all `severity` references to `type`
- Add a test that verifies `question` appears as an option

In `packages/frontend/src/components/__tests__/comment-thread.test.tsx`:

- Rename `severity` to `type` in mock data

In `packages/frontend/src/components/__tests__/diff-viewer.test.tsx`:

- Rename all `severity` references to `type`

In `packages/frontend/src/pages/__tests__/pr-review.test.tsx`:

- Rename all `severity` references to `type`

In `packages/frontend/src/utils/__tests__/comment-thread-status.test.ts`:

- Rename `severity` to `type` in mock data

- [ ] **Step 8: Build and test frontend**

Run: `npm run build --workspace=packages/frontend && npm run test --workspace=packages/frontend`
Expected: Zero TypeScript errors, all tests pass.

- [ ] **Step 9: Commit**

```bash
git add packages/frontend/
git commit -m "feat: rename severity to type in frontend and add question type (#8)"
```

---

### Task 7: Update CLI

**Files:**

- Modify: `packages/cli/src/commands/review.ts:11,22,35,60,94-95,104,120,129-130`
- Modify: `packages/cli/src/commands/__tests__/review.test.ts`

- [ ] **Step 1: Update review.ts**

In `packages/cli/src/commands/review.ts`:

Line 11 — rename field in interface:

```typescript
type: string;
```

Lines 22, 35 — rename `bySeverity` to `byType`:

```typescript
for (const [t, count] of Object.entries(summary.byType)) {
```

```typescript
const typeParts = Object.entries(f.byType);
```

Line 60 — update display logic:

```typescript
const typeLabel = c.type === 'must-fix' ? 'MUST FIX' : c.type.toUpperCase();
```

Lines 94-95 — rename CLI flag:

```typescript
.option(
  '--type <level>',
  'Filter by type (question, suggestion, request, must-fix)',
)
```

Line 104 — update options type:

```typescript
type?: string;
```

Line 120 — update query param:

```typescript
if (options.type) parameters.set('type', options.type);
```

Lines 129-130 — update heading:

```typescript
} else if (options.type) {
  heading = `${options.type} comments`;
}
```

- [ ] **Step 2: Update CLI review tests**

In `packages/cli/src/commands/__tests__/review.test.ts`:

- Rename all `bySeverity` to `byType` in mock data
- Rename all `severity` to `type` in comment objects
- Update the `'filters by severity'` test to `'filters by type'`
- Update the CLI flag test from `--severity` to `--type`

- [ ] **Step 3: Build and test CLI**

Run: `npm run build --workspace=packages/cli && npm run test --workspace=packages/cli`
Expected: Zero TypeScript errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/
git commit -m "feat: rename severity to type in CLI (#8)"
```

---

### Task 8: Full build, test, and coverage verification

**Files:** None (verification only)

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: Zero TypeScript errors across all packages.

- [ ] **Step 2: Full test suite with coverage**

Run: `npm run test:coverage`
Expected: All tests pass, 80%+ coverage maintained across all packages.

- [ ] **Step 3: Lint check**

Run: `npm run lint`
Expected: No lint errors.

- [ ] **Step 4: Format check**

Run: `npm run format:check`
Expected: No formatting issues.

- [ ] **Step 5: Final commit (if any formatting/lint fixes needed)**

```bash
git add packages/
git commit -m "chore: fix lint/formatting from severity to type rename (#8)"
```
