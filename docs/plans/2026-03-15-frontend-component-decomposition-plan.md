# Frontend Component Decomposition Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose `diff-viewer.tsx` (1,476 lines) and `pr-review.tsx` (941 lines) into focused modules without changing behavior.

**Architecture:** Two parallel streams — DiffViewer logic/hooks/components, then PRReview hook/components — merged at the end with a `CommentActions` interface simplification. Pure refactor: no functional changes.

**Tech Stack:** React 19, TypeScript, Vitest, @testing-library/react

**Spec:** `docs/plans/2026-03-15-frontend-component-decomposition-design.md`

**Working directory:** All paths relative to `packages/frontend/src/` unless otherwise noted.

**Test command:** `npm test --workspace=packages/frontend`

**Build command:** `npm run build`

---

## Chunk 1: Stream 1 — Pure Logic Extraction

### Task 1: Extract diff parser

**Files:**

- Create: `utils/diff-parser.ts`
- Create: `utils/__tests__/diff-parser.test.ts`
- Modify: `components/diff-viewer.tsx` (remove extracted code, add import)

- [ ] **Step 1: Create `utils/diff-parser.ts`**

Move the following from `diff-viewer.tsx` into this new file:

- Types: `DiffHunk`, `DiffLine`, `FileDiffData`, `FileStatus`, `DiffParserState`
- Functions: `createNewFile`, `parseDiffHeaderLine`, `parseDiffContentLine`, `parseDiff`

Export: `parseDiff`, `FileDiffData`, `DiffHunk`, `DiffLine`, `FileStatus`

Keep `DiffParserState` and the three helper functions as non-exported internals.

```typescript
// utils/diff-parser.ts
export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface DiffLine {
  type: 'add' | 'remove' | 'context' | 'header';
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

export type FileStatus = 'added' | 'removed' | 'modified';

export interface FileDiffData {
  path: string;
  hunks: DiffHunk[];
  lineCount: number;
  additions: number;
  deletions: number;
  status: FileStatus;
}

// ... (move parseDiff and helpers exactly as-is from diff-viewer.tsx lines 85-206)
```

- [ ] **Step 2: Write unit tests for `parseDiff`**

```typescript
// utils/__tests__/diff-parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseDiff } from '../diff-parser.js';

const SIMPLE_DIFF = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,5 +1,5 @@
 import express from 'express';
-const port = 3000;
+const port = 8080;
 const app = express();
 app.get('/', (req, res) => {
   res.send('Hello');`;

describe('parseDiff', () => {
  it('returns empty array for empty string', () => {
    expect(parseDiff('')).toEqual([]);
  });

  it('returns empty array for non-string input', () => {
    expect(parseDiff(undefined as unknown as string)).toEqual([]);
  });

  it('parses a simple file with additions and deletions', () => {
    const files = parseDiff(SIMPLE_DIFF);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('src/app.ts');
    expect(files[0].status).toBe('modified');
    expect(files[0].additions).toBe(1);
    expect(files[0].deletions).toBe(1);
  });

  it('detects added files (from /dev/null)', () => {
    const diff = `diff --git a/new.ts b/new.ts
--- /dev/null
+++ b/new.ts
@@ -0,0 +1,1 @@
+export const x = 1;`;
    const files = parseDiff(diff);
    expect(files[0].status).toBe('added');
    expect(files[0].path).toBe('new.ts');
  });

  it('detects removed files (to /dev/null)', () => {
    const diff = `diff --git a/old.ts b/old.ts
--- a/old.ts
+++ /dev/null
@@ -1,1 +0,0 @@
-export const x = 1;`;
    const files = parseDiff(diff);
    expect(files[0].status).toBe('removed');
    expect(files[0].path).toBe('old.ts');
  });

  it('parses multiple files', () => {
    const diff = `diff --git a/a.ts b/a.ts
--- /dev/null
+++ b/a.ts
@@ -0,0 +1,1 @@
+a
diff --git a/b.ts b/b.ts
--- /dev/null
+++ b/b.ts
@@ -0,0 +1,1 @@
+b`;
    const files = parseDiff(diff);
    expect(files).toHaveLength(2);
    expect(files[0].path).toBe('a.ts');
    expect(files[1].path).toBe('b.ts');
  });

  it('sets correct line numbers on hunks', () => {
    const files = parseDiff(SIMPLE_DIFF);
    const lines = files[0].hunks[0].lines;
    const contextLine = lines.find((l) => l.type === 'context');
    expect(contextLine?.oldLineNo).toBe(1);
    expect(contextLine?.newLineNo).toBe(1);
  });
});
```

- [ ] **Step 3: Run new tests to verify they pass**

Run: `npx vitest run utils/__tests__/diff-parser.test.ts --reporter verbose`
Expected: All tests pass.

- [ ] **Step 4: Update `diff-viewer.tsx` to import from `utils/diff-parser.ts`**

Remove lines 62-206 from `diff-viewer.tsx` (the types + `parseDiff` and helpers). Add:

```typescript
import {
  parseDiff,
  type FileDiffData,
  type DiffHunk,
  type DiffLine,
  type FileStatus,
} from '../utils/diff-parser.js';
```

Also update the existing `export type FileStatus` line — it's now a re-export:

```typescript
export type { FileStatus } from '../utils/diff-parser.js';
```

- [ ] **Step 5: Run all existing tests to verify nothing broke**

Run: `npm test --workspace=packages/frontend`
Expected: All 292+ tests pass. Zero regressions.

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/utils/diff-parser.ts packages/frontend/src/utils/__tests__/diff-parser.test.ts packages/frontend/src/components/diff-viewer.tsx
git commit -m "refactor(frontend): extract diff parser to utils/diff-parser.ts (#5)"
```

---

### Task 2: Extract comment categorizer

**Files:**

- Create: `utils/comment-categorizer.ts`
- Create: `utils/__tests__/comment-categorizer.test.ts`
- Modify: `components/diff-viewer.tsx` (remove extracted code, add import)

- [ ] **Step 1: Create `utils/comment-categorizer.ts`**

Move the following from `diff-viewer.tsx`:

- Functions: `buildValidLineKeys`, `appendToMap`, `categorizeComment`, `buildCommentRangeLines`, `categorizeComments`

These functions depend on:

- `Comment` type from `./comment-thread.js` — import it
- `FileDiffData` from `../utils/diff-parser.js` — import it
- `sideForLineType` helper — this is a small inline function used by `buildValidLineKeys`. Copy the `sideForLineType` logic into this file as a private helper (it's 1 line: `return type === 'remove' ? 'old' : 'new'`).

Export: `categorizeComments` and `buildCommentRangeLines` (the two functions called from `DiffViewer`).

```typescript
// utils/comment-categorizer.ts
import type { Comment } from '../components/comment-thread.js';
import type { FileDiffData } from './diff-parser.js';

// ... (move functions exactly as-is from diff-viewer.tsx lines 644-759)
// Add sideForLineType as a private helper used by buildValidLineKeys
```

- [ ] **Step 2: Write unit tests**

```typescript
// utils/__tests__/comment-categorizer.test.ts
import { describe, it, expect } from 'vitest';
import {
  categorizeComments,
  buildCommentRangeLines,
} from '../comment-categorizer.js';
import type { FileDiffData } from '../diff-parser.js';

function makeComment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    reviewCycleId: 'rc1',
    filePath: 'src/app.ts',
    startLine: 1,
    endLine: 1,
    body: 'test',
    type: 'suggestion',
    author: 'human' as const,
    parentCommentId: undefined,
    resolved: false,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeFile(path: string): FileDiffData {
  return {
    path,
    hunks: [
      {
        header: '@@ -1,1 +1,1 @@',
        lines: [
          { type: 'context', content: 'line', oldLineNo: 1, newLineNo: 1 },
        ],
      },
    ],
    lineCount: 1,
    additions: 0,
    deletions: 0,
    status: 'modified',
  };
}

describe('categorizeComments', () => {
  it('categorizes line comments by file:line:side key', () => {
    const result = categorizeComments(
      [makeComment()],
      [makeFile('src/app.ts')],
    );
    expect(result.commentsByFileLine.get('src/app.ts:1:new')).toHaveLength(1);
  });

  it('categorizes global comments (no filePath)', () => {
    const result = categorizeComments(
      [
        makeComment({
          filePath: undefined,
          startLine: undefined,
          endLine: undefined,
        }),
      ],
      [makeFile('src/app.ts')],
    );
    expect(result.globalComments).toHaveLength(1);
  });

  it('categorizes file-level comments (filePath but no startLine)', () => {
    const result = categorizeComments(
      [makeComment({ startLine: undefined, endLine: undefined })],
      [makeFile('src/app.ts')],
    );
    expect(result.fileCommentsByPath.get('file:src/app.ts')).toHaveLength(1);
  });

  it('categorizes replies by parent ID', () => {
    const result = categorizeComments(
      [makeComment({ id: 'r1', parentCommentId: 'c1' })],
      [makeFile('src/app.ts')],
    );
    expect(result.repliesByParent.get('c1')).toHaveLength(1);
  });

  it('orphans comments on lines not in the diff', () => {
    const result = categorizeComments(
      [makeComment({ startLine: 999, endLine: 999 })],
      [makeFile('src/app.ts')],
    );
    expect(result.orphanedByFile.get('src/app.ts')).toHaveLength(1);
  });

  it('orphans comments on files not in the diff', () => {
    const result = categorizeComments(
      [
        makeComment({
          filePath: 'missing.ts',
          startLine: undefined,
          endLine: undefined,
        }),
      ],
      [makeFile('src/app.ts')],
    );
    expect(result.orphanedByFile.get('missing.ts')).toHaveLength(1);
  });
});

describe('buildCommentRangeLines', () => {
  it('builds set of line keys for multi-line comments', () => {
    const comments = [makeComment({ startLine: 2, endLine: 4 })];
    const result = buildCommentRangeLines(comments);
    expect(result.has('src/app.ts:2:new')).toBe(true);
    expect(result.has('src/app.ts:3:new')).toBe(true);
    expect(result.has('src/app.ts:4:new')).toBe(true);
    expect(result.has('src/app.ts:5:new')).toBe(false);
  });

  it('skips single-line comments', () => {
    const comments = [makeComment({ startLine: 1, endLine: 1 })];
    const result = buildCommentRangeLines(comments);
    expect(result.size).toBe(0);
  });
});
```

- [ ] **Step 3: Run new tests to verify they pass**

Run: `npx vitest run utils/__tests__/comment-categorizer.test.ts --reporter verbose`
Expected: All tests pass.

- [ ] **Step 4: Update `diff-viewer.tsx` to import from `utils/comment-categorizer.ts`**

Remove the extracted functions from `diff-viewer.tsx` (lines ~644-759). Add:

```typescript
import {
  categorizeComments,
  buildCommentRangeLines,
} from '../utils/comment-categorizer.js';
```

`buildCommentRangeLines` is only called internally by `categorizeComments` (which returns the result as `commentRangeLines`). It is not imported directly by `diff-viewer.tsx`. Export it as a named export solely for direct unit testing.

- [ ] **Step 5: Run all existing tests**

Run: `npm test --workspace=packages/frontend`
Expected: All tests pass. Zero regressions.

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/utils/comment-categorizer.ts packages/frontend/src/utils/__tests__/comment-categorizer.test.ts packages/frontend/src/components/diff-viewer.tsx
git commit -m "refactor(frontend): extract comment categorizer to utils/comment-categorizer.ts (#5)"
```

---

### Task 3: Create shared types file

**Files:**

- Create: `components/diff-viewer-types.ts`
- Modify: `components/diff-viewer.tsx` (use new types)

- [ ] **Step 1: Create `components/diff-viewer-types.ts`**

```typescript
// components/diff-viewer-types.ts
import type { CommentSide } from '@agent-shepherd/shared';

export interface AddCommentData {
  filePath: string | undefined;
  startLine: number | undefined;
  endLine: number | undefined;
  body: string;
  type: string;
  side: CommentSide | undefined;
}

export interface CommentActions {
  onAdd?: (data: AddCommentData) => void;
  onReply?: (commentId: string, body: string) => void;
  onResolve?: (commentId: string) => void;
  onEdit?: (commentId: string, body: string) => void;
  onDelete?: (commentId: string) => void;
}

export type { FileDiffData, FileStatus } from '../utils/diff-parser.js';
```

- [ ] **Step 2: Update `diff-viewer.tsx` to import shared types**

Replace the `AddCommentData` interface in `diff-viewer.tsx` with an import:

```typescript
import type { AddCommentData, CommentActions } from './diff-viewer-types.js';
```

Remove the local `AddCommentData` interface definition. Keep `DiffViewerProperties` using the individual callback props for now — the `CommentActions` consolidation happens in a later task after all components are extracted.

Update the `export type FileStatus` to re-export from the types file:

```typescript
export type {
  FileStatus,
  AddCommentData,
  CommentActions,
} from './diff-viewer-types.js';
```

- [ ] **Step 3: Run all tests**

Run: `npm test --workspace=packages/frontend`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/components/diff-viewer-types.ts packages/frontend/src/components/diff-viewer.tsx
git commit -m "refactor(frontend): create shared diff-viewer-types.ts (#5)"
```

---

## Chunk 2: Stream 1 — Hook Extraction

### Task 4: Extract `use-line-selection` hook

**Files:**

- Create: `hooks/use-line-selection.ts`
- Create: `hooks/__tests__/use-line-selection.test.ts`
- Modify: `components/diff-viewer.tsx` (remove extracted state/handlers, use hook)

- [ ] **Step 1: Create `hooks/use-line-selection.ts`**

Move from `DiffViewer` component (lines ~842-1184):

- State: `commentFormLine`, `rangeAnchor`, `dragSelection`, `buttonsHidden`, `isDragging` ref, `dragAnchor` ref, `fileCommentFormPath`
- Handlers: `handleLineClick`, `handleCancelComment`, `handleAddComment`, `handleFileComment`, `handleGlobalComment`, `handleDragStart`, `handleDragOver`, `finalizeDrag`
- Effect: the global `mouseup` listener

```typescript
// hooks/use-line-selection.ts
import { useState, useRef, useCallback, useEffect } from 'react';
import type { AddCommentData } from '../components/diff-viewer-types.js';

interface LineSelection {
  file: string;
  startLine: number;
  endLine: number;
  side: 'old' | 'new';
}

interface UseLineSelectionOptions {
  onAddComment?: (data: AddCommentData) => void;
  onToggleGlobalCommentForm?: () => void;
}

export function useLineSelection(options: UseLineSelectionOptions) {
  const { onAddComment, onToggleGlobalCommentForm } = options;

  const [commentFormLine, setCommentFormLine] = useState<
    LineSelection | undefined
  >();
  const [rangeAnchor, setRangeAnchor] = useState<
    { file: string; line: number; side: 'old' | 'new' } | undefined
  >();
  const [dragSelection, setDragSelection] = useState<
    LineSelection | undefined
  >();
  const [buttonsHidden, setButtonsHidden] = useState(false);
  const isDragging = useRef(false);
  const dragAnchor = useRef<
    { file: string; line: number; side: 'old' | 'new' } | undefined
  >(undefined);
  const [fileCommentFormPath, setFileCommentFormPath] = useState<
    string | undefined
  >();

  // ... (move all handler implementations exactly as-is)

  return {
    commentFormLine,
    dragSelection,
    buttonsHidden,
    setButtonsHidden,
    fileCommentFormPath,
    setFileCommentFormPath,
    handleLineClick,
    handleCancelComment,
    handleAddComment,
    handleFileComment,
    handleGlobalComment,
    handleDragStart,
    handleDragOver,
    finalizeDrag,
  };
}
```

- [ ] **Step 2: Write tests for the hook**

```typescript
// hooks/__tests__/use-line-selection.test.ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLineSelection } from '../use-line-selection.js';

describe('useLineSelection', () => {
  it('returns initial state with no selection', () => {
    const { result } = renderHook(() => useLineSelection({}));
    expect(result.current.commentFormLine).toBeUndefined();
    expect(result.current.dragSelection).toBeUndefined();
    expect(result.current.buttonsHidden).toBe(false);
    expect(result.current.fileCommentFormPath).toBeUndefined();
  });

  it('sets comment form on line click', () => {
    const { result } = renderHook(() =>
      useLineSelection({ onAddComment: vi.fn() }),
    );
    act(() => {
      result.current.handleLineClick('file.ts', 5, false, 'new');
    });
    expect(result.current.commentFormLine).toEqual({
      file: 'file.ts',
      startLine: 5,
      endLine: 5,
      side: 'new',
    });
  });

  it('extends range on shift-click in same file and side', () => {
    const { result } = renderHook(() =>
      useLineSelection({ onAddComment: vi.fn() }),
    );
    act(() => {
      result.current.handleLineClick('file.ts', 3, false, 'new');
    });
    act(() => {
      result.current.handleLineClick('file.ts', 7, true, 'new');
    });
    expect(result.current.commentFormLine).toEqual({
      file: 'file.ts',
      startLine: 3,
      endLine: 7,
      side: 'new',
    });
  });

  it('clears selection on cancel', () => {
    const { result } = renderHook(() =>
      useLineSelection({ onAddComment: vi.fn() }),
    );
    act(() => {
      result.current.handleLineClick('file.ts', 5, false, 'new');
    });
    act(() => {
      result.current.handleCancelComment();
    });
    expect(result.current.commentFormLine).toBeUndefined();
    expect(result.current.buttonsHidden).toBe(true);
  });

  it('calls onAddComment and clears form on handleAddComment', () => {
    const onAdd = vi.fn();
    const { result } = renderHook(() =>
      useLineSelection({ onAddComment: onAdd }),
    );
    act(() => {
      result.current.handleAddComment(
        'file.ts',
        1,
        3,
        'body',
        'suggestion',
        'new',
      );
    });
    expect(onAdd).toHaveBeenCalledWith({
      filePath: 'file.ts',
      startLine: 1,
      endLine: 3,
      body: 'body',
      type: 'suggestion',
      side: 'new',
    });
  });

  it('manages fileCommentFormPath', () => {
    const { result } = renderHook(() => useLineSelection({}));
    act(() => {
      result.current.setFileCommentFormPath('src/app.ts');
    });
    expect(result.current.fileCommentFormPath).toBe('src/app.ts');
  });
});
```

- [ ] **Step 3: Run new tests**

Run: `npx vitest run hooks/__tests__/use-line-selection.test.ts --reporter verbose`
Expected: All tests pass.

- [ ] **Step 4: Update `diff-viewer.tsx` to use the hook**

In the `DiffViewer` component, replace all the extracted state variables and handlers with:

```typescript
const {
  commentFormLine,
  dragSelection,
  buttonsHidden,
  setButtonsHidden,
  fileCommentFormPath,
  setFileCommentFormPath,
  handleLineClick,
  handleCancelComment,
  handleAddComment,
  handleFileComment,
  handleGlobalComment,
  handleDragStart,
  handleDragOver,
  finalizeDrag,
} = useLineSelection({
  onAddComment,
  onToggleGlobalCommentForm,
});
```

Remove the corresponding `useState`, `useRef`, `useCallback`, and `useEffect` blocks.

- [ ] **Step 5: Run all existing tests**

Run: `npm test --workspace=packages/frontend`
Expected: All tests pass. Zero regressions.

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/hooks/use-line-selection.ts packages/frontend/src/hooks/__tests__/use-line-selection.test.ts packages/frontend/src/components/diff-viewer.tsx
git commit -m "refactor(frontend): extract use-line-selection hook (#5)"
```

---

### Task 5: Extract `use-file-visibility` hook

**Files:**

- Create: `hooks/use-file-visibility.ts`
- Create: `hooks/__tests__/use-file-visibility.test.ts`
- Modify: `components/diff-viewer.tsx` (remove extracted state/effects, use hook)

- [ ] **Step 1: Create `hooks/use-file-visibility.ts`**

Move from `DiffViewer` component:

- Helper functions: `handleIntersectingEntry`, `handleNonIntersectingEntry`, `updateVisibleFiles` (these are currently module-level functions in diff-viewer.tsx)
- State: `visible`, `measuredHeights`, `pinnedReference` ref, `isScrolling` ref, `observerReference` ref
- Refs: `containerReference`, `fileReferences`
- `createFileReferenceCallback`
- Effects: IntersectionObserver setup, scroll-to-file, scroll-handler for visible-file-change
- The `if (scrollToFile && !visible.has(scrollToFile))` block — **IMPORTANT:** This block calls `setVisible` synchronously during render (not in an effect). This pattern must be preserved exactly in the hook. Do NOT move it into a `useEffect` — that would change the timing and cause a flash of placeholder content before the target file renders.

```typescript
// hooks/use-file-visibility.ts
import { useState, useRef, useCallback, useEffect } from 'react';
import type { FileDiffData } from '../utils/diff-parser.js';

interface UseFileVisibilityOptions {
  parsedFiles: FileDiffData[];
  scrollToFile: string | undefined;
  scrollKey: number;
  onVisibleFileChange?: (file: string) => void;
}

// ... (move helper functions and hook implementation)

export function useFileVisibility(options: UseFileVisibilityOptions) {
  // ... state, refs, effects ...

  // Synchronous render-time state update — preserves original behavior
  if (options.scrollToFile && !visible.has(options.scrollToFile)) {
    setVisible((previous) => {
      if (previous.has(options.scrollToFile!)) return previous;
      const next = new Set(previous);
      next.add(options.scrollToFile!);
      return next;
    });
  }

  // ... returns { visible, measuredHeights, containerRef, fileRefs, createFileRefCallback }
}
```

- [ ] **Step 2: Write tests**

```typescript
// hooks/__tests__/use-file-visibility.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFileVisibility } from '../use-file-visibility.js';
import type { FileDiffData } from '../../utils/diff-parser.js';

function makeFile(path: string): FileDiffData {
  return {
    path,
    hunks: [],
    lineCount: 10,
    additions: 5,
    deletions: 5,
    status: 'modified',
  };
}

describe('useFileVisibility', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'IntersectionObserver',
      vi.fn(() => ({
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
      })),
    );
  });

  it('returns initial empty visible set', () => {
    const { result } = renderHook(() =>
      useFileVisibility({
        parsedFiles: [makeFile('a.ts')],
        scrollToFile: undefined,
        scrollKey: 0,
      }),
    );
    expect(result.current.visible.size).toBe(0);
  });

  it('provides a containerRef', () => {
    const { result } = renderHook(() =>
      useFileVisibility({
        parsedFiles: [],
        scrollToFile: undefined,
        scrollKey: 0,
      }),
    );
    expect(result.current.containerRef).toBeDefined();
  });

  it('adds scrollToFile to visible set', () => {
    const { result } = renderHook(() =>
      useFileVisibility({
        parsedFiles: [makeFile('target.ts')],
        scrollToFile: 'target.ts',
        scrollKey: 1,
      }),
    );
    expect(result.current.visible.has('target.ts')).toBe(true);
  });
});
```

- [ ] **Step 3: Run new tests**

Run: `npx vitest run hooks/__tests__/use-file-visibility.test.ts --reporter verbose`
Expected: All tests pass.

- [ ] **Step 4: Update `diff-viewer.tsx` to use the hook**

Replace the extracted state, refs, and effects with:

```typescript
const {
  visible,
  measuredHeights,
  containerRef: containerReference,
  fileRefs: fileReferences,
  createFileRefCallback: createFileReferenceCallback,
} = useFileVisibility({
  parsedFiles,
  scrollToFile,
  scrollKey,
  onVisibleFileChange,
});
```

Remove: `containerReference` ref, `fileReferences` ref, `visible` state, `measuredHeights` state, `pinnedReference` ref, `isScrolling` ref, `observerReference` ref, `createFileReferenceCallback`, the three effects, and the `scrollToFile` visible-set block.

Also remove the module-level `updateVisibleFiles`, `handleIntersectingEntry`, `handleNonIntersectingEntry` functions.

- [ ] **Step 5: Run all existing tests**

Run: `npm test --workspace=packages/frontend`
Expected: All tests pass. Zero regressions.

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/hooks/use-file-visibility.ts packages/frontend/src/hooks/__tests__/use-file-visibility.test.ts packages/frontend/src/components/diff-viewer.tsx
git commit -m "refactor(frontend): extract use-file-visibility hook (#5)"
```

---

## Chunk 3: Stream 1 — Subcomponent Extraction

### Task 6: Extract `GlobalComments` component

**Files:**

- Create: `components/global-comments.tsx`
- Modify: `components/diff-viewer.tsx` (replace inline JSX with component)

- [ ] **Step 1: Create `components/global-comments.tsx`**

Extract the "Global/PR-level comments" JSX block from `DiffViewer`'s return (the `mb-6 border rounded overflow-hidden` div containing `globalComments.map(...)` and the `globalCommentForm` conditional).

```typescript
// components/global-comments.tsx
import { CommentForm } from './comment-form.js';
import { CommentThread } from './comment-thread.js';
import type { Comment } from './comment-thread.js';
import type { ThreadStatus } from '../utils/comment-thread-status.js';

interface GlobalCommentsProperties {
  comments: Comment[];
  repliesByParent: Map<string, Comment[]>;
  onReply: (commentId: string, body: string) => void;
  onResolve: (commentId: string) => void;
  onEdit?: (commentId: string, body: string) => void;
  onDelete?: (commentId: string) => void;
  canEditComments?: boolean;
  threadStatusMap?: Map<string, ThreadStatus>;
  globalCommentForm: boolean;
  onToggleGlobalCommentForm?: () => void;
  onSubmit: (body: string, type: string) => void;
}

export function GlobalComments({ ... }: Readonly<GlobalCommentsProperties>) {
  // ... (move JSX from diff-viewer.tsx lines ~1207-1254)
}
```

- [ ] **Step 2: Update `diff-viewer.tsx` to use `GlobalComments`**

Replace the inline JSX block with:

```tsx
{
  (globalComments.length > 0 || globalCommentForm) && (
    <GlobalComments
      comments={globalComments}
      repliesByParent={repliesByParent}
      onReply={onReplyComment ?? noopCallback}
      onResolve={onResolveComment ?? noopCallback}
      onEdit={onEditComment}
      onDelete={onDeleteComment}
      canEditComments={canEditComments}
      threadStatusMap={threadStatusMap}
      globalCommentForm={globalCommentForm ?? false}
      onToggleGlobalCommentForm={onToggleGlobalCommentForm}
      onSubmit={handleGlobalComment}
    />
  );
}
```

- [ ] **Step 3: Run all existing tests**

Run: `npm test --workspace=packages/frontend`
Expected: All tests pass (existing diff-viewer tests cover global comments rendering).

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/components/global-comments.tsx packages/frontend/src/components/diff-viewer.tsx
git commit -m "refactor(frontend): extract GlobalComments component (#5)"
```

---

### Task 7: Extract `FileGroupHeader` component

**Files:**

- Create: `components/file-group-header.tsx`
- Modify: `components/diff-viewer.tsx` (replace inline IIFE with component)

- [ ] **Step 1: Create `components/file-group-header.tsx`**

Extract the IIFE in `diff-viewer.tsx` that renders group headers (lines ~1258-1312).

```typescript
// components/file-group-header.tsx
interface FileGroupHeaderProperties {
  group?: { name: string; description?: string };
  isNewGroup: boolean;
  isUngrouped: boolean;
}

export function FileGroupHeader({
  group,
  isNewGroup,
  isUngrouped,
}: Readonly<FileGroupHeaderProperties>) {
  if (isNewGroup && group) {
    return (
      <div className="px-4 py-3 mb-2 border-b" style={{ ... }}>
        <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
          {group.name}
        </div>
        {group.description && (
          <div className="text-xs mt-0.5 opacity-60">{group.description}</div>
        )}
      </div>
    );
  }
  if (isUngrouped) {
    return (
      <div className="px-4 py-3 mb-2 border-b" style={{ ... }}>
        <div className="text-sm font-semibold opacity-60">Other Changes</div>
      </div>
    );
  }
  return undefined;
}
```

- [ ] **Step 2: Update `diff-viewer.tsx`**

Replace the IIFE with:

```tsx
{
  fileToGroup && (
    <FileGroupHeader
      group={fileToGroup.get(file.path)}
      isNewGroup={!!(group && previousGroup?.name !== group.name)}
      isUngrouped={
        !group &&
        (index === 0 || (!!previousFile && fileToGroup.has(previousFile.path)))
      }
    />
  );
}
```

Note: compute `group`, `previousFile`, `previousGroup` before the JSX as local variables (they already are in the current IIFE).

- [ ] **Step 3: Run all existing tests**

Run: `npm test --workspace=packages/frontend`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/components/file-group-header.tsx packages/frontend/src/components/diff-viewer.tsx
git commit -m "refactor(frontend): extract FileGroupHeader component (#5)"
```

---

### Task 8: Extract `OrphanedComments` component

**Files:**

- Create: `components/orphaned-comments.tsx`
- Modify: `components/diff-viewer.tsx` (replace inline JSX in two locations)

- [ ] **Step 1: Create `components/orphaned-comments.tsx`**

This component is used in two places:

1. Inside `FileDiffComponent` — for per-file orphaned comments (lines that moved)
2. At the bottom of `DiffViewer` — for files not in the diff at all

```typescript
// components/orphaned-comments.tsx
import { CommentThread } from './comment-thread.js';
import type { Comment } from './comment-thread.js';
import type { ThreadStatus } from '../utils/comment-thread-status.js';

interface OrphanedCommentsProperties {
  comments: Comment[];
  repliesByParent: Map<string, Comment[]>;
  onReply: (commentId: string, body: string) => void;
  onResolve: (commentId: string) => void;
  onEdit?: (commentId: string, body: string) => void;
  onDelete?: (commentId: string) => void;
  canEditComments?: boolean;
  threadStatusMap?: Map<string, ThreadStatus>;
  label?: string;
}

export function OrphanedComments({ ... }: Readonly<OrphanedCommentsProperties>) {
  if (comments.length === 0) return undefined;
  return (
    <div className="border-t" style={{ borderColor: 'var(--color-border)' }}>
      <div className="px-4 py-2 text-xs" style={{ opacity: 0.6, backgroundColor: 'var(--color-bg-secondary)' }}>
        {label ?? 'Comments on lines no longer in this diff'}
      </div>
      {comments.map((comment) => (
        <div key={comment.id} className="px-4 py-1">
          {comment.startLine !== undefined && (
            <div className="text-xs mb-1" style={{ opacity: 0.5 }}>
              Line{comment.startLine !== comment.endLine && comment.endLine !== undefined
                ? `s ${String(comment.startLine)}–${String(comment.endLine)}`
                : ` ${String(comment.startLine)}`}
            </div>
          )}
          <CommentThread
            comment={comment}
            replies={repliesByParent.get(comment.id) ?? []}
            onReply={onReply}
            onResolve={onResolve}
            onEdit={onEdit}
            onDelete={onDelete}
            canEdit={canEditComments}
            threadStatus={threadStatusMap?.get(comment.id)}
          />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Update `diff-viewer.tsx` — both locations**

**Location 1: Inside `FileDiffComponent`** (lines ~601-639) — replace the orphaned comments `<div className="border-t">` block with:

```tsx
<OrphanedComments
  comments={orphanedComments}
  repliesByParent={repliesByParent}
  onReply={onReplyComment ?? noopCallback}
  onResolve={onResolveComment ?? noopCallback}
  onEdit={onEditComment}
  onDelete={onDeleteComment}
  canEditComments={canEditComments}
  threadStatusMap={threadStatusMap}
/>
```

**Location 2: Bottom of `DiffViewer` return** (lines ~1414-1473) — replace the `orphanedByFile.entries()` map block. Keep the outer wrapper div (with file path header + "(not in current diff)" label) but replace the inner comments rendering:

```tsx
{
  [...orphanedByFile.entries()]
    .filter(([filePath]) => !parsedFiles.some((f) => f.path === filePath))
    .map(([filePath, orphanComments]) => (
      <div
        key={`orphaned-${filePath}`}
        className="mb-6 border rounded overflow-hidden"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div
          className="px-4 py-2 text-sm font-mono font-medium border-b"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            borderColor: 'var(--color-border)',
          }}
        >
          <span className="truncate">{filePath}</span>
          <span className="ml-2 text-xs" style={{ opacity: 0.6 }}>
            (not in current diff)
          </span>
        </div>
        <OrphanedComments
          comments={orphanComments}
          repliesByParent={repliesByParent}
          onReply={onReplyComment ?? noopCallback}
          onResolve={onResolveComment ?? noopCallback}
          onEdit={onEditComment}
          onDelete={onDeleteComment}
          canEditComments={canEditComments}
          threadStatusMap={threadStatusMap}
        />
      </div>
    ));
}
```

- [ ] **Step 3: Run all existing tests**

Run: `npm test --workspace=packages/frontend`
Expected: All tests pass (existing tests cover orphaned comment rendering).

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/components/orphaned-comments.tsx packages/frontend/src/components/diff-viewer.tsx
git commit -m "refactor(frontend): extract OrphanedComments component (#5)"
```

---

### Task 9: Verify Stream 1 completion

- [ ] **Step 1: Run full test suite**

Run: `npm test --workspace=packages/frontend`
Expected: All tests pass.

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Zero TypeScript errors.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: No new lint errors.

- [ ] **Step 4: Verify `diff-viewer.tsx` line count**

Run: `wc -l packages/frontend/src/components/diff-viewer.tsx`
Expected: Roughly ~350-450 lines (down from 1,476).

- [ ] **Step 5: Commit any formatting changes**

If lint-staged made formatting changes, commit them:

```bash
git add -A && git diff --cached --stat
# If changes exist:
git commit -m "style: format after Stream 1 extraction (#5)"
```

---

## Chunk 4: Stream 2 — PRReview Hook Extraction

### Task 10: Extract `use-pr-data` hook

**Files:**

- Create: `hooks/use-pr-data.ts`
- Create: `hooks/__tests__/use-pr-data.test.ts`
- Modify: `pages/pr-review.tsx` (massive reduction — use hook)

- [ ] **Step 1: Create `hooks/use-pr-data.ts`**

Move from `pr-review.tsx`:

- Interfaces: `ReviewCycle`, `PrData`, `DiffData`, `WsMessageData` — **export `ReviewCycle` and `PrData`** (needed by `pr-header.tsx` in Task 11)
- Helper functions: `formatAgentError`, `sortedByCycleNumber` — **export `sortedByCycleNumber`** (needed by `pr-header.tsx` for cycle selector option-building)
- All state variables except `scrollToFile`, `scrollKey` ref, `visibleFile`
- All `useCallback` handlers. **Note:** `handleAddComment`, `handleReplyComment`, `handleResolveComment`, `handleEditComment`, `handleDeleteComment` are currently plain `async` functions (not `useCallback`-wrapped). Wrap them in `useCallback` when moving them into the hook so that downstream `useMemo` consumers get stable references.
- The `useWebSocket` call
- The initial load `useEffect`
- All `useMemo` computations
- **Important — scroll state boundary:** `fetchDiff` currently resets `scrollToFile` and `visibleFile` (pr-review.tsx lines 233-234). Since those stay as local state in `pr-review.tsx`, the hook must accept an `onDiffLoaded` callback. Inside `fetchDiff`, call `onDiffLoaded?.()` where those resets currently live. In `pr-review.tsx`, provide the callback to reset scroll state.

```typescript
// hooks/use-pr-data.ts
import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../api.js';
import type { ActivityEntry } from '../components/agent-activity-panel.js';
import type { Comment } from '../components/comment-thread.js';
import type { CommentFilterValue } from '../components/comment-filter.js';
import { useWebSocket } from './use-web-socket.js';
import {
  getThreadStatus,
  groupThreads,
} from '../utils/comment-thread-status.js';
import type { ThreadStatus } from '../utils/comment-thread-status.js';
import type { FileStatus } from '../components/diff-viewer-types.js';

export interface ReviewCycle {
  /* ... move from pr-review.tsx lines 21-30 */
}
export interface PrData {
  /* ... move from pr-review.tsx lines 32-41 */
}

// ... (other interfaces and helpers)

export { sortedByCycleNumber };

interface UsePrDataOptions {
  onDiffLoaded?: () => void;
}

export function usePrData(
  prId: string | undefined,
  options?: UsePrDataOptions,
) {
  // ... all state, effects, handlers, derived data
  // In fetchDiff, after setDiffData(diff) and setFileGroups/setViewMode:
  //   options?.onDiffLoaded?.();
  // instead of setScrollToFile(undefined); setVisibleFile(undefined);

  return {
    // Data
    pr,
    diffData,
    comments,
    cycles,
    insights,
    loading,
    error,
    selectedCycle,
    diffLoading,
    diffError,
    globalCommentForm,
    agentError,
    agentActivity,
    commentFilter,
    insightsActivity,
    activeTab,
    analyzerRunning,
    fileGroups,
    viewMode,

    // Derived
    fileStatuses,
    latestCycle,
    threadStatusMap,
    selectedCycleData,
    filterCounts,
    filteredComments,
    commentCounts,
    topLevelComments,
    agentWorking,
    agentErrored,

    // Handlers
    handleCycleChange,
    handleAddComment,
    handleReplyComment,
    handleResolveComment,
    handleEditComment,
    handleDeleteComment,
    handleReview,
    handleCancelAgent,
    handleRunAnalyzer,
    handleCancelAnalyzer,
    handleClosePr,
    handleReopenPr,
    setGlobalCommentForm,
    setCommentFilter,
    setActiveTab,
    setViewMode,
  };
}
```

- [ ] **Step 2: Write tests for the hook**

```typescript
// hooks/__tests__/use-pr-data.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { usePrData } from '../use-pr-data.js';

vi.mock('../../api.js', () => ({
  api: {
    prs: {
      get: vi.fn(),
      diff: vi.fn(),
      cycles: vi.fn(),
      review: vi.fn(),
      cancelAgent: vi.fn(),
      close: vi.fn(),
      reopen: vi.fn(),
    },
    comments: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    insights: {
      get: vi.fn(),
      runAnalyzer: vi.fn(),
    },
  },
}));

let wsCallback:
  | ((message: { event: string; data: Record<string, unknown> }) => void)
  | undefined;
vi.mock('../use-web-socket.js', () => ({
  useWebSocket: vi
    .fn()
    .mockImplementation(
      (
        cb?: (msg: { event: string; data: Record<string, unknown> }) => void,
      ) => {
        wsCallback = cb;
        return { connected: true };
      },
    ),
}));

import { api } from '../../api.js';
const mockApi = vi.mocked(api, true);

const SIMPLE_DIFF = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,3 @@
 import express from 'express';
-const port = 3000;
+const port = 8080;
 const app = express();`;

describe('usePrData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.prs.get.mockResolvedValue({
      id: 'pr-1',
      projectId: 'proj-1',
      title: 'Test PR',
      sourceBranch: 'feat/test',
      baseBranch: 'main',
      status: 'open',
    });
    mockApi.prs.diff.mockResolvedValue({
      diff: SIMPLE_DIFF,
      files: ['src/app.ts'],
    });
    mockApi.prs.cycles.mockResolvedValue([]);
    mockApi.comments.list.mockResolvedValue([]);
    mockApi.insights.get.mockResolvedValue(undefined);
  });

  it('loads PR data on mount', async () => {
    const { result } = renderHook(() => usePrData('pr-1'));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.pr?.title).toBe('Test PR');
    expect(result.current.diffData?.files).toEqual(['src/app.ts']);
  });

  it('sets loading true initially', () => {
    mockApi.prs.get.mockReturnValue(new Promise(() => {}));
    mockApi.prs.diff.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => usePrData('pr-1'));
    expect(result.current.loading).toBe(true);
  });

  it('sets error on load failure', async () => {
    mockApi.prs.get.mockRejectedValue(new Error('Not found'));
    mockApi.prs.diff.mockRejectedValue(new Error('Not found'));
    const { result } = renderHook(() => usePrData('pr-1'));
    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
  });

  it('computes fileStatuses from diff', async () => {
    const { result } = renderHook(() => usePrData('pr-1'));
    await waitFor(() => !result.current.loading);
    expect(result.current.fileStatuses['src/app.ts']).toBe('modified');
  });

  it('handles WebSocket comment:added by refetching', async () => {
    const { result } = renderHook(() => usePrData('pr-1'));
    await waitFor(() => !result.current.loading);
    mockApi.comments.list.mockResolvedValue([]);

    act(() => {
      wsCallback?.({ event: 'comment:added', data: {} });
    });

    await waitFor(() => {
      expect(mockApi.comments.list.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('returns undefined for no prId', () => {
    const { result } = renderHook(() => usePrData(undefined));
    expect(result.current.loading).toBe(true);
    expect(result.current.pr).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run new tests**

Run: `npx vitest run hooks/__tests__/use-pr-data.test.ts --reporter verbose`
Expected: All tests pass.

- [ ] **Step 4: Rewrite `pr-review.tsx` to use the hook**

Replace the entire body of `PRReview` with:

```typescript
export function PRReview() {
  const { prId } = useParams<{ prId: string }>();
  const data = usePrData(prId);

  const [visibleFile, setVisibleFile] = useState<string | undefined>();
  const [scrollToFile, setScrollToFile] = useState<string | undefined>();
  const scrollKeyRef = useRef(0);

  const handleFileSelect = useCallback((file: string) => {
    scrollKeyRef.current++;
    setScrollToFile(file);
    setVisibleFile(file);
  }, []);

  if (data.loading) return <div className="p-6">Loading...</div>;
  if (data.error) return <div className="p-6 text-red-500">Error: {data.error}</div>;
  if (!data.pr || !data.diffData) return <div className="p-6">PR not found</div>;

  // ... (keep existing JSX structure with these substitution patterns:)
  // State references: pr → data.pr, diffData → data.diffData, comments → data.comments,
  //   cycles → data.cycles, insights → data.insights, selectedCycle → data.selectedCycle,
  //   diffLoading → data.diffLoading, diffError → data.diffError,
  //   globalCommentForm → data.globalCommentForm, agentError → data.agentError,
  //   agentActivity → data.agentActivity, commentFilter → data.commentFilter,
  //   insightsActivity → data.insightsActivity, activeTab → data.activeTab,
  //   analyzerRunning → data.analyzerRunning, fileGroups → data.fileGroups,
  //   viewMode → data.viewMode
  //
  // Derived: fileStatuses → data.fileStatuses, latestCycle → data.latestCycle,
  //   threadStatusMap → data.threadStatusMap, filteredComments → data.filteredComments,
  //   commentCounts → data.commentCounts, filterCounts → data.filterCounts,
  //   topLevelComments → data.topLevelComments, agentWorking → data.agentWorking,
  //   agentErrored → data.agentErrored, selectedCycleData → data.selectedCycleData
  //
  // Handlers: handleCycleChange → data.handleCycleChange,
  //   handleAddComment → data.handleAddComment, handleReplyComment → data.handleReplyComment,
  //   handleResolveComment → data.handleResolveComment, handleEditComment → data.handleEditComment,
  //   handleDeleteComment → data.handleDeleteComment, handleReview → data.handleReview,
  //   handleCancelAgent → data.handleCancelAgent, handleRunAnalyzer → data.handleRunAnalyzer,
  //   handleCancelAnalyzer → data.handleCancelAnalyzer, handleClosePr → data.handleClosePr,
  //   handleReopenPr → data.handleReopenPr
  //
  // Setters: setGlobalCommentForm → data.setGlobalCommentForm,
  //   setCommentFilter → data.setCommentFilter, setActiveTab → data.setActiveTab,
  //   setViewMode → data.setViewMode
  //
  // Local state stays as-is: scrollToFile, scrollKeyRef, visibleFile, handleFileSelect
}
```

Keep imports to existing components (FileTree, DiffViewer, ReviewBar, etc.). The JSX structure stays the same. The `pr-review.test.tsx` mocks should continue to work without changes since they mock at the API/WebSocket module level, which the hook calls internally.

- [ ] **Step 5: Run all existing tests**

Run: `npm test --workspace=packages/frontend`
Expected: All tests pass. Zero regressions.

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/hooks/use-pr-data.ts packages/frontend/src/hooks/__tests__/use-pr-data.test.ts packages/frontend/src/pages/pr-review.tsx
git commit -m "refactor(frontend): extract use-pr-data hook (#5)"
```

---

## Chunk 5: Stream 2 — Subcomponent Extraction

### Task 11: Extract `PRHeader` component

**Files:**

- Create: `components/pr-header.tsx`
- Modify: `pages/pr-review.tsx`

- [ ] **Step 1: Create `components/pr-header.tsx`**

Extract the header div (from `px-6 py-3 border-b shrink-0` through the cycle selector and status badges). This includes the complex cycle selector option-building logic.

Import `sortedByCycleNumber` and types from the hook module:

```typescript
import {
  sortedByCycleNumber,
  type ReviewCycle,
  type PrData,
} from '../hooks/use-pr-data.js';
```

These were exported in Task 10 Step 1.

Props match the spec: `pr`, `selectedCycle`, `selectedCycleData`, `cycles`, `diffLoading`, `diffError`, `globalCommentForm`, `agentWorking`, `onCycleChange`, `onToggleGlobalCommentForm`, `onClosePr`, `onReopenPr`.

- [ ] **Step 2: Update `pr-review.tsx`**

Replace the header JSX block with `<PRHeader ... />`.

- [ ] **Step 3: Run all tests**

Run: `npm test --workspace=packages/frontend`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/components/pr-header.tsx packages/frontend/src/pages/pr-review.tsx packages/frontend/src/hooks/use-pr-data.ts
git commit -m "refactor(frontend): extract PRHeader component (#5)"
```

---

### Task 12: Extract `PRTabBar` component

**Files:**

- Create: `components/pr-tab-bar.tsx`
- Modify: `pages/pr-review.tsx`

- [ ] **Step 1: Create `components/pr-tab-bar.tsx`**

```typescript
// components/pr-tab-bar.tsx
interface PRTabBarProperties {
  activeTab: 'review' | 'insights';
  onTabChange: (tab: 'review' | 'insights') => void;
  agentWorking: boolean;
  analyzerRunning: boolean;
}

export function PRTabBar({
  activeTab,
  onTabChange,
  agentWorking,
  analyzerRunning,
}: Readonly<PRTabBarProperties>) {
  return (
    <div className="flex border-b shrink-0" style={{ borderColor: 'var(--color-border)' }}>
      <button
        onClick={() => onTabChange('review')}
        className={`px-4 py-2 text-sm flex items-center gap-1.5 ${activeTab === 'review' ? 'border-b-2' : 'opacity-60'}`}
        style={activeTab === 'review' ? { borderColor: 'var(--color-accent)', color: 'var(--color-accent)' } : {}}
      >
        Review
        {agentWorking && <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />}
      </button>
      <button
        onClick={() => onTabChange('insights')}
        className={`px-4 py-2 text-sm flex items-center gap-1.5 ${activeTab === 'insights' ? 'border-b-2' : 'opacity-60'}`}
        style={activeTab === 'insights' ? { borderColor: 'var(--color-accent)', color: 'var(--color-accent)' } : {}}
      >
        Insights
        {analyzerRunning && <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Update `pr-review.tsx`**

Replace the tab bar JSX with `<PRTabBar ... />`.

- [ ] **Step 3: Run all tests**

Run: `npm test --workspace=packages/frontend`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/components/pr-tab-bar.tsx packages/frontend/src/pages/pr-review.tsx
git commit -m "refactor(frontend): extract PRTabBar component (#5)"
```

---

### Task 13: Extract `InsightsFooter` component

**Files:**

- Create: `components/insights-footer.tsx`
- Modify: `pages/pr-review.tsx`

- [ ] **Step 1: Create `components/insights-footer.tsx`**

Extract the insights tab bottom bar (the `px-6 py-3 border-t` div with Run/Cancel Analyzer buttons).

```typescript
// components/insights-footer.tsx
interface InsightsFooterProperties {
  analyzerRunning: boolean;
  hasComments: boolean;
  onRunAnalyzer: () => void;
  onCancelAnalyzer: () => void;
}

export function InsightsFooter({ ... }: Readonly<InsightsFooterProperties>) {
  // ... (move JSX from pr-review.tsx lines ~902-937)
}
```

- [ ] **Step 2: Update `pr-review.tsx`**

Replace the inline JSX with `<InsightsFooter ... />`.

- [ ] **Step 3: Run all tests**

Run: `npm test --workspace=packages/frontend`
Expected: All tests pass (existing test "shows Run Analyzer button on insights tab" covers this).

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/components/insights-footer.tsx packages/frontend/src/pages/pr-review.tsx
git commit -m "refactor(frontend): extract InsightsFooter component (#5)"
```

---

### Task 14: Extract `ReviewContent` component

**Files:**

- Create: `components/review-content.tsx`
- Modify: `pages/pr-review.tsx`

- [ ] **Step 1: Create `components/review-content.tsx`**

Extract the review tab body — the `flex flex-col flex-1 overflow-hidden` div containing:

- `AgentStatusSection`
- `CommentFilter` (conditionally shown)
- The `flex flex-1 overflow-hidden` div with `FileTree` + `DiffViewer` or error states

This is a larger extraction. The component receives many props (per spec) and composes existing child components.

Note: At this point DiffViewer still uses individual callback props. This component will pass them through individually. The `CommentActions` consolidation happens in Task 15.

- [ ] **Step 2: Update `pr-review.tsx`**

Replace the review tab body JSX with `<ReviewContent ... />`.

- [ ] **Step 3: Run all tests**

Run: `npm test --workspace=packages/frontend`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/components/review-content.tsx packages/frontend/src/pages/pr-review.tsx
git commit -m "refactor(frontend): extract ReviewContent component (#5)"
```

---

## Chunk 6: Interface Merge & Final Verification

### Task 15: Consolidate `CommentActions` interface

**Files:**

- Modify: `components/diff-viewer.tsx` (update `DiffViewerProperties` to use `CommentActions`)
- Modify: `components/review-content.tsx` (pass `CommentActions` instead of individual callbacks)
- Modify: `pages/pr-review.tsx` (build `CommentActions` object from `usePrData`)
- Modify: `components/__tests__/diff-viewer.test.tsx` (update test call sites)
- Modify: `pages/__tests__/pr-review.test.tsx` (should pass without changes since it renders full component)

- [ ] **Step 1: Update `DiffViewerProperties` in `diff-viewer.tsx`**

Replace the 5 individual callback props with:

```typescript
interface DiffViewerProperties {
  diff: string;
  files: string[];
  scrollToFile: string | undefined;
  scrollKey: number;
  onVisibleFileChange?: (file: string) => void;
  comments?: Comment[];
  threadStatusMap?: Map<string, ThreadStatus>;
  commentActions?: CommentActions;
  canEditComments?: boolean;
  globalCommentForm?: boolean;
  onToggleGlobalCommentForm?: () => void;
  fileGroups?: { name: string; description?: string; files: string[] }[];
  viewMode?: 'directory' | 'logical';
}
```

Update the destructuring in `DiffViewer` to extract from `commentActions`:

```typescript
const onAddComment = commentActions?.onAdd;
const onReplyComment = commentActions?.onReply;
const onResolveComment = commentActions?.onResolve;
const onEditComment = commentActions?.onEdit;
const onDeleteComment = commentActions?.onDelete;
```

- [ ] **Step 2: Update `diff-viewer.test.tsx` test call sites**

Replace individual callback props with `commentActions`:

```typescript
// Before:
<DiffViewer ... onAddComment={onAddComment} onReplyComment={vi.fn()} onResolveComment={vi.fn()} />

// After:
<DiffViewer ... commentActions={{ onAdd: onAddComment, onReply: vi.fn(), onResolve: vi.fn() }} />
```

Apply this transformation to all test renders that use these props. Search for `onAddComment=`, `onReplyComment=`, `onResolveComment=`, `onEditComment=`, `onDeleteComment=` in the test file and consolidate them.

For tests that only pass `onAddComment`, use `commentActions={{ onAdd: onAddComment }}`.

- [ ] **Step 3: Update `review-content.tsx`**

Pass `commentActions` as a single prop to `DiffViewer` instead of spreading 5 callbacks.

- [ ] **Step 4: Update `pr-review.tsx`**

Build the `CommentActions` object from `usePrData`. Since all handlers are `useCallback`-wrapped in the hook (per Task 10), `useMemo` works correctly:

```typescript
const commentActions: CommentActions = useMemo(
  () => ({
    onAdd: data.handleAddComment,
    onReply: data.handleReplyComment,
    onResolve: data.handleResolveComment,
    onEdit: data.handleEditComment,
    onDelete: data.handleDeleteComment,
  }),
  [
    data.handleAddComment,
    data.handleReplyComment,
    data.handleResolveComment,
    data.handleEditComment,
    data.handleDeleteComment,
  ],
);
```

Pass this to `ReviewContent` as a single prop.

- [ ] **Step 5: Run all tests**

Run: `npm test --workspace=packages/frontend`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/components/diff-viewer.tsx packages/frontend/src/components/diff-viewer-types.ts packages/frontend/src/components/review-content.tsx packages/frontend/src/pages/pr-review.tsx packages/frontend/src/components/__tests__/diff-viewer.test.tsx
git commit -m "refactor(frontend): consolidate comment callbacks into CommentActions interface (#5)"
```

---

### Task 16: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass across all packages.

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Zero TypeScript errors.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: No lint errors.

- [ ] **Step 4: Run coverage check**

Run: `npm run test:coverage --workspace=packages/frontend`
Expected: Coverage meets 80% threshold.

- [ ] **Step 5: Verify file sizes**

Run: `wc -l packages/frontend/src/components/diff-viewer.tsx packages/frontend/src/pages/pr-review.tsx`
Expected: `diff-viewer.tsx` ~350-450 lines, `pr-review.tsx` ~150-250 lines.

- [ ] **Step 6: Verify all new files exist**

Run: `ls -la packages/frontend/src/utils/diff-parser.ts packages/frontend/src/utils/comment-categorizer.ts packages/frontend/src/hooks/use-line-selection.ts packages/frontend/src/hooks/use-file-visibility.ts packages/frontend/src/hooks/use-pr-data.ts packages/frontend/src/components/diff-viewer-types.ts packages/frontend/src/components/global-comments.tsx packages/frontend/src/components/file-group-header.tsx packages/frontend/src/components/orphaned-comments.tsx packages/frontend/src/components/pr-header.tsx packages/frontend/src/components/pr-tab-bar.tsx packages/frontend/src/components/review-content.tsx packages/frontend/src/components/insights-footer.tsx`
Expected: All 13 files present.
