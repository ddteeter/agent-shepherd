# Comment Side Tracking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix issue #13 — comments on diff lines with shared line numbers (add/remove on same line) appear on both sides instead of only the targeted side.

**Architecture:** Add a `side` field (`'old' | 'new'`) across the full stack (DB schema, shared types, API, frontend). Constrain multi-line selections to a single side. Use side-aware keys for comment matching.

**Tech Stack:** SQLite/Drizzle ORM, TypeScript, React, Fastify, Vitest

**Design doc:** `docs/plans/2026-03-15-comment-side-tracking-design.md`

---

### Task 1: Add `side` to shared types

**Files:**

- Modify: `packages/shared/src/types.ts:13` (add type alias)
- Modify: `packages/shared/src/types.ts:53-65` (Comment interface)
- Modify: `packages/shared/src/types.ts:80-93` (BatchCommentPayload)
- Modify: `packages/shared/src/types.ts:118-126` (CreateCommentInput)

**Step 1: Add CommentSide type and update interfaces**

Add a `CommentSide` type alias after `CommentAuthor` (line 15):

```typescript
export type CommentSide = 'old' | 'new';
```

Add `side` to the `Comment` interface (after `endLine`):

```typescript
side: CommentSide | null;
```

Add `side` to `CreateCommentInput` (after `endLine`):

```typescript
side?: CommentSide | null;
```

Add `side` to `BatchCommentPayload.comments` items (after `endLine`):

```typescript
side?: CommentSide | null;
```

**Step 2: Run build to verify types compile**

Run: `npm run build --workspace=packages/shared`
Expected: PASS (type-only changes, no runtime impact yet)

**Step 3: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "feat: add CommentSide type and side field to comment interfaces"
```

---

### Task 2: Add `side` column to DB schema + generate migration

**Files:**

- Modify: `packages/backend/src/db/schema.ts:52-70` (comments table)

**Step 1: Add side column to comments table**

Add after the `endLine` column (line 59):

```typescript
side: text('side'),
```

**Step 2: Generate Drizzle migration**

Run: `cd packages/backend && npx drizzle-kit generate --name add_comment_side`
Expected: Migration file created in `packages/backend/drizzle/`

**Step 3: Run build and tests**

Run: `npm run build --workspace=packages/backend && npm run test --workspace=packages/backend`
Expected: Build passes. Tests pass (nullable column, backward-compatible).

**Step 4: Commit**

```bash
git add packages/backend/src/db/schema.ts packages/backend/drizzle/
git commit -m "feat: add side column to comments table with migration"
```

---

### Task 3: Update backend comment routes to handle `side`

**Files:**

- Modify: `packages/backend/src/routes/comments.ts:272-338` (single comment creation)
- Modify: `packages/backend/src/routes/comments.ts:404-492` (batch comment creation)
- Test: `packages/backend/src/routes/__tests__/comments.test.ts`

**Step 1: Write failing test for side field round-trip**

Add a test to `packages/backend/src/routes/__tests__/comments.test.ts` that:

1. Creates a comment with `side: 'old'`
2. Fetches comments for the PR
3. Asserts the returned comment has `side: 'old'`

Also test:

- Creating a comment with `side: 'new'` returns `side: 'new'`
- Creating a comment without `side` returns `side: null`
- Batch endpoint passes `side` through for each comment

**Step 2: Run test to verify it fails**

Run: `npm run test --workspace=packages/backend -- --grep "side"`
Expected: FAIL — route doesn't destructure or pass `side` yet

**Step 3: Update single comment creation route**

In `packages/backend/src/routes/comments.ts`, at the POST `/api/prs/:prId/comments` handler (line 272):

Add `side` to the destructured body (line 274-282):

```typescript
const {
  filePath,
  startLine,
  endLine,
  side,
  body,
  type,
  author,
  parentCommentId,
} = request.body as CreateCommentInput;
```

Add `side` to the `.values()` call (line 295-306):

```typescript
.values({
  id,
  reviewCycleId,
  filePath,
  startLine,
  endLine,
  side,
  body,
  type: type ?? 'suggestion',
  author,
  parentCommentId,
})
```

**Step 4: Update batch comment creation route**

In the POST `/api/prs/:prId/comments/batch` handler (line 404), add `side` to the batch insert values (line 422-431):

```typescript
.values({
  id,
  reviewCycleId,
  filePath: comment.filePath,
  startLine: comment.startLine,
  endLine: comment.endLine,
  side: comment.side,
  body: comment.body,
  type: comment.type ?? 'suggestion',
  author: 'agent',
})
```

Also update the reply insert (lines 455-465) to copy `side` from the parent comment:

```typescript
.values({
  id,
  reviewCycleId,
  filePath: parent.filePath,
  startLine: parent.startLine,
  endLine: parent.endLine,
  side: parent.side,
  body: replyItem.body,
  type: replyItem.type ?? 'suggestion',
  author: 'agent',
  parentCommentId: replyItem.parentCommentId,
})
```

**Step 5: Run tests to verify they pass**

Run: `npm run test --workspace=packages/backend`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add packages/backend/src/routes/comments.ts packages/backend/src/routes/__tests__/comments.test.ts
git commit -m "feat: pass side field through comment creation routes"
```

---

### Task 4: Update frontend comment matching to use side-aware keys

**Files:**

- Modify: `packages/frontend/src/components/diff-viewer.tsx:618-634` (buildValidLineKeys)
- Modify: `packages/frontend/src/components/diff-viewer.tsx:646-678` (categorizeComment)
- Modify: `packages/frontend/src/components/diff-viewer.tsx:680-696` (buildCommentRangeLines)
- Modify: `packages/frontend/src/components/diff-viewer.tsx:429-441` (line rendering key lookup)
- Test: `packages/frontend/src/components/__tests__/diff-viewer.test.tsx`

**Step 1: Write failing test for side-aware comment matching**

Add a test to `packages/frontend/src/components/__tests__/diff-viewer.test.tsx`:

Create a diff where removed and added lines share the same line number. Create a comment with `side: 'old'` on that line number. Render the DiffViewer with the comment. Assert that only ONE CommentThread renders (on the removed line), not two.

The diff should look like:

```typescript
const SIDE_AWARE_DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -1,3 +1,3 @@
 import config from './config';
-const port = 3000;
+const port = 8080;
 export default port;`;
```

The comment: `{ id: '1', reviewCycleId: 'rc1', filePath: 'src/config.ts', startLine: 2, endLine: 2, side: 'old', body: 'Why change this?', type: 'question', author: 'human', parentCommentId: null, resolved: false, createdAt: '2026-01-01T00:00:00Z' }`

Assert: exactly 1 element with text "Why change this?" rendered.

**Step 2: Run test to verify it fails**

Run: `npm run test --workspace=packages/frontend -- --grep "side"`
Expected: FAIL — comment shows on both the removed and added line

**Step 3: Add helper function to derive side from DiffLine type**

Add near the existing helper functions (around line 227):

```typescript
function sideForLineType(type: string): 'old' | 'new' {
  return type === 'remove' ? 'old' : 'new';
}
```

**Step 4: Update buildValidLineKeys to include side**

In `buildValidLineKeys` (line 618), change the key generation:

```typescript
function buildValidLineKeys(parsedFiles: FileDiffData[]): {
  validLineKeys: Set<string>;
  diffFilePaths: Set<string>;
} {
  const validLineKeys = new Set<string>();
  const diffFilePaths = new Set<string>();
  for (const file of parsedFiles) {
    diffFilePaths.add(file.path);
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        const side = sideForLineType(line.type);
        const lineNo =
          side === 'old'
            ? (line.oldLineNo ?? 0)
            : (line.newLineNo ?? line.oldLineNo ?? 0);
        validLineKeys.add(`${file.path}:${String(lineNo)}:${side}`);
      }
    }
  }
  return { validLineKeys, diffFilePaths };
}
```

**Step 5: Update categorizeComment to use side-aware key**

In `categorizeComment` (line 672), change the key construction:

```typescript
const side = comment.side ?? 'new';
const key = `${comment.filePath}:${String(comment.endLine ?? comment.startLine)}:${side}`;
```

**Step 6: Update buildCommentRangeLines to include side**

In `buildCommentRangeLines` (line 680), change the key construction:

```typescript
function buildCommentRangeLines(comments: Comment[]): Set<string> {
  const rangeLines = new Set<string>();
  for (const comment of comments) {
    if (
      !comment.parentCommentId &&
      comment.filePath !== undefined &&
      comment.startLine !== undefined &&
      comment.endLine !== undefined &&
      comment.startLine !== comment.endLine
    ) {
      const side = comment.side ?? 'new';
      for (let l = comment.startLine; l <= comment.endLine; l++) {
        rangeLines.add(`${comment.filePath}:${String(l)}:${side}`);
      }
    }
  }
  return rangeLines;
}
```

**Step 7: Update line rendering to use side-aware key**

In `FileDiffComponent` where lines are rendered (around line 429-441), change the key lookup:

```typescript
const side = sideForLineType(line.type);
const lineNo =
  side === 'old'
    ? (line.oldLineNo ?? 0)
    : (line.newLineNo ?? line.oldLineNo ?? 0);
const lineKey = `${file.path}:${String(lineNo)}:${side}`;
```

Also update the line number display columns — the removed line should show `oldLineNo` and added line should show `newLineNo` (this is already correct in the existing code at lines 506-515).

**Step 8: Run tests to verify they pass**

Run: `npm run test --workspace=packages/frontend`
Expected: All tests PASS

**Step 9: Commit**

```bash
git add packages/frontend/src/components/diff-viewer.tsx packages/frontend/src/components/__tests__/diff-viewer.test.tsx
git commit -m "feat: use side-aware keys for comment matching in diff viewer"
```

---

### Task 5: Update frontend selection to track and constrain by side

**Files:**

- Modify: `packages/frontend/src/components/diff-viewer.tsx:28-56` (DiffViewerProperties)
- Modify: `packages/frontend/src/components/diff-viewer.tsx:810-837` (state declarations)
- Modify: `packages/frontend/src/components/diff-viewer.tsx:1014-1031` (handleLineClick)
- Modify: `packages/frontend/src/components/diff-viewer.tsx:1040-1053` (handleAddComment)
- Modify: `packages/frontend/src/components/diff-viewer.tsx:1083-1094` (handleDragStart, handleDragOver)
- Modify: `packages/frontend/src/components/diff-viewer.tsx:429-461` (onClick/onMouseDown handlers)
- Modify: `packages/frontend/src/pages/pr-review.tsx:290-312` (handleAddComment)
- Test: `packages/frontend/src/components/__tests__/diff-viewer.test.tsx`

**Step 1: Write failing test for selection constraint**

Add a test that renders a diff with both removed and added lines. Start a drag on a removed line, drag over an added line. Assert that the added line is NOT included in the selection highlight (i.e., the comment form's startLine/endLine only covers the removed lines).

**Step 2: Run test to verify it fails**

Run: `npm run test --workspace=packages/frontend -- --grep "constrain"`
Expected: FAIL — selection currently includes both sides

**Step 3: Add side to selection state types**

Update `commentFormLine` state (line 810) to include side:

```typescript
const [commentFormLine, setCommentFormLine] = useState<
  | {
      file: string;
      startLine: number;
      endLine: number;
      side: 'old' | 'new';
    }
  | undefined
>();
```

Update `rangeAnchor` state (line 818) to include side:

```typescript
const [rangeAnchor, setRangeAnchor] = useState<
  | {
      file: string;
      line: number;
      side: 'old' | 'new';
    }
  | undefined
>();
```

Update `dragSelection` state (line 825) to include side:

```typescript
const [dragSelection, setDragSelection] = useState<
  | {
      file: string;
      startLine: number;
      endLine: number;
      side: 'old' | 'new';
    }
  | undefined
>();
```

Update `dragAnchor` ref (line 835) to include side:

```typescript
const dragAnchor = useRef<
  { file: string; line: number; side: 'old' | 'new' } | undefined
>(undefined);
```

**Step 4: Update line click/drag handlers to pass and use side**

Update the `onClick` handler in FileDiffComponent (line 456-459) to pass line type:

```typescript
onClick={
  onAddComment
    ? (event) => {
        onLineClick(file.path, lineNo, event.shiftKey, sideForLineType(line.type));
      }
    : undefined
}
```

Update `onMouseDown` handler (line 462-470):

```typescript
onMouseDown={
  onAddComment
    ? (event) => {
        if (!event.shiftKey) {
          event.preventDefault();
          onDragStart(file.path, lineNo, sideForLineType(line.type));
        }
      }
    : undefined
}
```

Update `onMouseEnter` to pass side (line 472-477):

```typescript
onMouseEnter={() => {
  setHoveredLineKey(
    `${String(hunkIndex)}:${String(lineIndex)}`,
  );
  onDragOver(file.path, lineNo, sideForLineType(line.type));
}}
```

Update the `isInSelectedRange` check (line 433-436) to also match side:

```typescript
const lineSide = sideForLineType(line.type);
const isInSelectedRange =
  activeRange?.file === file.path &&
  activeRange.side === lineSide &&
  lineNo >= activeRange.startLine &&
  lineNo <= activeRange.endLine;
```

Update `isFormOpenAfterThis` (line 437-439) to also match side:

```typescript
const isFormOpenAfterThis =
  commentFormLine?.file === file.path &&
  commentFormLine.side === lineSide &&
  commentFormLine.endLine === lineNo;
```

Update `isInCommentRange` (line 440) to use side-aware key:

```typescript
const isInCommentRange = commentRangeLines.has(lineKey);
```

(This already works since lineKey was updated in Task 4.)

**Step 5: Update FileDiffComponent prop types**

Update `onLineClick` signature (line 298):

```typescript
onLineClick: (filePath: string, lineNo: number, shiftKey: boolean, side: 'old' | 'new') => void;
```

Update `onDragStart` signature (line 299):

```typescript
onDragStart: (filePath: string, lineNo: number, side: 'old' | 'new') => void;
```

Update `onDragOver` signature:

```typescript
onDragOver: (filePath: string, lineNo: number, side: 'old' | 'new') => void;
```

Update `commentFormLine` and `dragSelection` types to include `side: 'old' | 'new'`.

**Step 6: Update handleLineClick to use side**

In `handleLineClick` (line 1014):

```typescript
const handleLineClick = useCallback(
  (
    filePath: string,
    lineNo: number,
    shiftKey: boolean,
    side: 'old' | 'new',
  ) => {
    if (isDragging.current) return;
    if (
      shiftKey &&
      rangeAnchor?.file === filePath &&
      rangeAnchor.side === side
    ) {
      const startLine = Math.min(rangeAnchor.line, lineNo);
      const endLine = Math.max(rangeAnchor.line, lineNo);
      setCommentFormLine({ file: filePath, startLine, endLine, side });
    } else {
      setRangeAnchor({ file: filePath, line: lineNo, side });
      setCommentFormLine({
        file: filePath,
        startLine: lineNo,
        endLine: lineNo,
        side,
      });
    }
  },
  [rangeAnchor],
);
```

Key behavior: shift-click is ignored if the target side doesn't match the anchor side.

**Step 7: Update handleDragStart and handleDragOver**

`handleDragStart` (line 1083):

```typescript
const handleDragStart = useCallback(
  (filePath: string, lineNo: number, side: 'old' | 'new') => {
    dragAnchor.current = { file: filePath, line: lineNo, side };
  },
  [],
);
```

`handleDragOver` (line 1087):

```typescript
const handleDragOver = useCallback(
  (filePath: string, lineNo: number, side: 'old' | 'new') => {
    if (dragAnchor.current?.file !== filePath) return;
    if (dragAnchor.current.side !== side) return;
    if (dragAnchor.current.line === lineNo && !isDragging.current) return;
    isDragging.current = true;
    const start = Math.min(dragAnchor.current.line, lineNo);
    const end = Math.max(dragAnchor.current.line, lineNo);
    setDragSelection({ file: filePath, startLine: start, endLine: end, side });
  },
  [],
);
```

Key behavior: `handleDragOver` returns early if the hovered line's side doesn't match the drag anchor's side.

**Step 8: Update handleAddComment to pass side**

In `handleAddComment` (line 1040):

```typescript
const handleAddComment = useCallback(
  (
    filePath: string | undefined,
    startLine: number | undefined,
    endLine: number | undefined,
    body: string,
    type: string,
    side: 'old' | 'new' | undefined,
  ) => {
    onAddComment?.({ filePath, startLine, endLine, body, type, side });
    setCommentFormLine(undefined);
    setRangeAnchor(undefined);
  },
  [onAddComment],
);
```

Update `DiffViewerProperties.onAddComment` (line 36-42) to include `side`:

```typescript
onAddComment?: (data: {
  filePath: string | undefined;
  startLine: number | undefined;
  endLine: number | undefined;
  body: string;
  type: string;
  side: 'old' | 'new' | undefined;
}) => void;
```

**Step 9: Update pr-review.tsx to pass side to API**

In `packages/frontend/src/pages/pr-review.tsx` (line 290):

```typescript
const handleAddComment = async (data: {
  filePath: string | undefined;
  startLine: number | undefined;
  endLine: number | undefined;
  body: string;
  type: string;
  side: 'old' | 'new' | undefined;
}) => {
  if (!prId) return;
  try {
    await api.comments.create(prId, {
      filePath: data.filePath,
      startLine: data.startLine,
      endLine: data.endLine,
      side: data.side,
      body: data.body,
      type: data.type,
      author: 'human',
    });
    await fetchComments();
  } catch (error_) {
    console.error('Failed to add comment:', error_);
    globalThis.alert('Failed to add comment. Check the console for details.');
  }
};
```

**Step 10: Update CommentForm invocation to pass side**

Where `CommentForm` is rendered after a selected line range (search for `handleAddComment` being passed as a prop with `commentFormLine`), ensure `side` from `commentFormLine.side` is passed through when calling `handleAddComment`.

Look for where the form calls back — the CommentForm's onSubmit should pass side through:

```typescript
handleAddComment(
  commentFormLine.file,
  commentFormLine.startLine,
  commentFormLine.endLine,
  body,
  type,
  commentFormLine.side,
);
```

**Step 11: Run tests to verify they pass**

Run: `npm run test --workspace=packages/frontend`
Expected: All tests PASS

**Step 12: Commit**

```bash
git add packages/frontend/ packages/frontend/src/pages/pr-review.tsx
git commit -m "feat: constrain line selection to single side and pass side through comment creation"
```

---

### Task 6: Update prompt builder batch format and orchestrator tests

**Files:**

- Modify: `packages/backend/src/orchestrator/review/prompt-builder.ts:195-219` (batch JSON example)
- Modify: `packages/backend/src/orchestrator/__tests__/feedback-integrator.test.ts` (add side to test fixtures)
- Modify: `packages/backend/src/orchestrator/__tests__/orchestrator.test.ts` (add side to test fixtures)

**Step 1: Update prompt builder batch format example**

In the batch JSON format reference section, add `side` to the example comment:

```json
{
  "filePath": "src/index.ts",
  "startLine": 42,
  "endLine": 42,
  "side": "new",
  "body": "Note: I moved this validation...",
  "type": "suggestion"
}
```

**Step 2: Update orchestrator test fixtures to include side**

Add `side: 'new'` (or `side: null`) to all comment fixtures in:

- `packages/backend/src/orchestrator/__tests__/feedback-integrator.test.ts`
- `packages/backend/src/orchestrator/__tests__/orchestrator.test.ts`

**Step 3: Run all tests**

Run: `npm run test`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add packages/backend/src/orchestrator/
git commit -m "feat: update prompt builder batch format and test fixtures for side field"
```

---

### Task 7: Full build + coverage verification

**Step 1: Run full build**

Run: `npm run build`
Expected: Zero TypeScript errors across all packages

**Step 2: Run full test suite with coverage**

Run: `npm run test:coverage`
Expected: All tests pass, 80%+ coverage maintained per package

**Step 3: Run lint**

Run: `npm run lint`
Expected: No lint errors

**Step 4: Fix any issues found, then commit**

If any build/test/lint issues, fix them and commit the fixes.
