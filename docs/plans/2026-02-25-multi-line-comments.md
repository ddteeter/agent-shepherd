# Multi-Line Comment Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to select a line range in the diff viewer (via shift-click or click-and-drag) to create multi-line comments.

**Architecture:** The backend already stores `startLine`/`endLine` on comments. This is a frontend-only change: add shift-click and click-and-drag range selection to the DiffViewer, widen the `onAddComment` callback to pass both values, and show range labels on multi-line comments.

**Tech Stack:** React 19, TypeScript, Vite (no frontend component tests exist — verification via `tsc` build + playwright-cli)

---

### Task 1: Update DiffViewerProps and DiffViewer State

**Files:**
- Modify: `packages/frontend/src/components/DiffViewer.tsx:7-17` (DiffViewerProps interface)
- Modify: `packages/frontend/src/components/DiffViewer.tsx:237-241` (state declarations)

**Step 1: Widen onAddComment in DiffViewerProps**

Change line 14 from:
```tsx
onAddComment?: (data: { filePath: string; line: number; body: string; severity: string }) => void;
```
to:
```tsx
onAddComment?: (data: { filePath: string; startLine: number; endLine: number; body: string; severity: string }) => void;
```

**Step 2: Update commentFormLine state type and add drag/anchor state**

Change line 240 from:
```tsx
const [commentFormLine, setCommentFormLine] = useState<{ file: string; line: number } | null>(null);
```
to:
```tsx
const [commentFormLine, setCommentFormLine] = useState<{ file: string; startLine: number; endLine: number } | null>(null);
const [rangeAnchor, setRangeAnchor] = useState<{ file: string; line: number } | null>(null);
const isDragging = useRef(false);
const dragAnchor = useRef<{ file: string; line: number } | null>(null);
```

**Step 3: Run TypeScript check**

Run: `cd packages/frontend && npx tsc --noEmit 2>&1 | head -40`
Expected: Type errors in DiffViewer.tsx (downstream code still uses old shape). This confirms the type change propagated.

**Step 4: Commit**

```bash
git add packages/frontend/src/components/DiffViewer.tsx
git commit -m "refactor: widen DiffViewer comment types to support line ranges"
```

---

### Task 2: Update DiffViewer Callbacks and Comment Grouping

**Files:**
- Modify: `packages/frontend/src/components/DiffViewer.tsx:299-323` (useMemo + handleAddComment)

**Step 1: Add commentRangeLines to the existing useMemo**

Replace lines 300-318:
```tsx
const { commentsByFileLine, repliesByParent, commentRangeLines } = useMemo(() => {
  const byFileLine = new Map<string, Comment[]>();
  const byParent = new Map<string, Comment[]>();
  const rangeLines = new Set<string>();

  for (const comment of comments) {
    if (comment.parentCommentId) {
      const existing = byParent.get(comment.parentCommentId) || [];
      existing.push(comment);
      byParent.set(comment.parentCommentId, existing);
    } else {
      const key = `${comment.filePath}:${comment.startLine}`;
      const existing = byFileLine.get(key) || [];
      existing.push(comment);
      byFileLine.set(key, existing);
      if (comment.startLine !== comment.endLine) {
        for (let l = comment.startLine; l <= comment.endLine; l++) {
          rangeLines.add(`${comment.filePath}:${l}`);
        }
      }
    }
  }

  return { commentsByFileLine: byFileLine, repliesByParent: byParent, commentRangeLines: rangeLines };
}, [comments]);
```

**Step 2: Replace handleAddComment and add interaction handlers**

Replace lines 320-323 with:
```tsx
const handleAddComment = useCallback((filePath: string, startLine: number, endLine: number, body: string, severity: string) => {
  onAddComment?.({ filePath, startLine, endLine, body, severity });
  setCommentFormLine(null);
  setRangeAnchor(null);
}, [onAddComment]);

// Shift-click: extend range from anchor. Normal click: set anchor + open single-line form.
const handleLineClick = useCallback((filePath: string, lineNo: number, shiftKey: boolean) => {
  if (shiftKey && rangeAnchor && rangeAnchor.file === filePath) {
    const start = Math.min(rangeAnchor.line, lineNo);
    const end = Math.max(rangeAnchor.line, lineNo);
    setCommentFormLine({ file: filePath, startLine: start, endLine: end });
  } else {
    setRangeAnchor({ file: filePath, line: lineNo });
    setCommentFormLine({ file: filePath, startLine: lineNo, endLine: lineNo });
  }
}, [rangeAnchor]);

// Drag: mousedown sets anchor, mouseover extends range, mouseup finalizes.
const handleDragStart = useCallback((filePath: string, lineNo: number) => {
  isDragging.current = true;
  dragAnchor.current = { file: filePath, line: lineNo };
  setRangeAnchor({ file: filePath, line: lineNo });
  setCommentFormLine({ file: filePath, startLine: lineNo, endLine: lineNo });
}, []);

const handleDragOver = useCallback((filePath: string, lineNo: number) => {
  if (!isDragging.current || !dragAnchor.current || dragAnchor.current.file !== filePath) return;
  const start = Math.min(dragAnchor.current.line, lineNo);
  const end = Math.max(dragAnchor.current.line, lineNo);
  setCommentFormLine({ file: filePath, startLine: start, endLine: end });
}, []);

const handleDragEnd = useCallback(() => {
  isDragging.current = false;
  dragAnchor.current = null;
}, []);

// Attach a global mouseup listener so drag ends even if mouse leaves the gutter
useEffect(() => {
  const onMouseUp = () => {
    if (isDragging.current) {
      isDragging.current = false;
      dragAnchor.current = null;
    }
  };
  window.addEventListener('mouseup', onMouseUp);
  return () => window.removeEventListener('mouseup', onMouseUp);
}, []);

const handleCancelComment = useCallback(() => {
  setCommentFormLine(null);
  setRangeAnchor(null);
}, []);
```

**Step 3: Commit**

```bash
git add packages/frontend/src/components/DiffViewer.tsx
git commit -m "feat: add shift-click and drag range selection callbacks"
```

---

### Task 3: Update FileDiff Component Props and Rendering

**Files:**
- Modify: `packages/frontend/src/components/DiffViewer.tsx:96-235` (FileDiff component)

**Step 1: Update the FileDiff component signature**

Replace lines 97-123 with:
```tsx
function FileDiffComponent({
  file,
  commentsByFileLine,
  repliesByParent,
  commentFormLine,
  commentRangeLines,
  onLineClick,
  onDragStart,
  onDragOver,
  onDragEnd,
  onCancelComment,
  onAddComment,
  handleAddComment,
  onReplyComment,
  onResolveComment,
  tokenizeLine,
  themeBg,
  themeFg,
}: {
  file: FileDiff;
  commentsByFileLine: Map<string, Comment[]>;
  repliesByParent: Map<string, Comment[]>;
  commentFormLine: { file: string; startLine: number; endLine: number } | null;
  commentRangeLines: Set<string>;
  onLineClick: (filePath: string, lineNo: number, shiftKey: boolean) => void;
  onDragStart: (filePath: string, lineNo: number) => void;
  onDragOver: (filePath: string, lineNo: number) => void;
  onDragEnd: () => void;
  onCancelComment: () => void;
  onAddComment?: DiffViewerProps['onAddComment'];
  handleAddComment: (filePath: string, startLine: number, endLine: number, body: string, severity: string) => void;
  onReplyComment?: DiffViewerProps['onReplyComment'];
  onResolveComment?: DiffViewerProps['onResolveComment'];
  tokenizeLine: (code: string, lang: string) => TokenizedLine | null;
  themeBg?: string;
  themeFg?: string;
}) {
```

Note: renamed from `FileDiff` to `FileDiffComponent` to avoid name collision with the `FileDiff` interface.

**Step 2: Update the line rendering inside FileDiffComponent**

Replace the `hunk.lines.map` callback (lines 166-229) with:
```tsx
{hunk.lines.map((line, lineIdx) => {
  const lineNo = line.newLineNo ?? line.oldLineNo ?? 0;
  const isFormOpen = commentFormLine?.file === file.path && commentFormLine?.endLine === lineNo;
  const isInSelectedRange = commentFormLine !== null
    && commentFormLine.file === file.path
    && lineNo >= commentFormLine.startLine
    && lineNo <= commentFormLine.endLine;
  const isInCommentRange = commentRangeLines.has(`${file.path}:${lineNo}`);
  const lineComments = commentsByFileLine.get(`${file.path}:${lineNo}`) || [];
  const tokens = tokenizeLine(line.content, lang);

  return (
    <div key={lineIdx}>
      <div
        className="diff-line px-4 py-0 flex relative"
        style={{
          borderLeft: line.type === 'add' ? '3px solid #3fb950'
            : line.type === 'remove' ? '3px solid #f85149'
            : '3px solid transparent',
          backgroundColor: isInSelectedRange
            ? 'rgba(9, 105, 218, 0.12)'
            : isInCommentRange
              ? 'rgba(9, 105, 218, 0.05)'
              : undefined,
        }}
        onMouseEnter={() => onDragOver(file.path, lineNo)}
        onMouseUp={onDragEnd}
      >
        {onAddComment && !isInSelectedRange && (
          <button
            className="diff-line-btn absolute left-0 top-0 w-5 h-5 flex items-center justify-center text-white text-xs rounded opacity-0"
            style={{ backgroundColor: 'var(--color-accent)', transform: 'translateX(-2px)' }}
            onClick={(e) => onLineClick(file.path, lineNo, e.shiftKey)}
            onMouseDown={(e) => { if (!e.shiftKey) { e.preventDefault(); onDragStart(file.path, lineNo); } }}
            title="Add comment (shift-click or drag for range)"
          >
            +
          </button>
        )}
        <span className="w-12 text-right pr-2 select-none shrink-0" style={{ color: themeFg, opacity: 0.4 }}>
          {line.oldLineNo ?? ''}
        </span>
        <span className="w-12 text-right pr-2 select-none shrink-0" style={{ color: themeFg, opacity: 0.4 }}>
          {line.newLineNo ?? ''}
        </span>
        <span className="w-4 select-none shrink-0" style={{
          color: line.type === 'add' ? '#3fb950' :
                 line.type === 'remove' ? '#f85149' : 'transparent'
        }}>
          {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
        </span>
        <HighlightedContent content={line.content} tokens={tokens} />
      </div>

      {isFormOpen && onAddComment && (
        <div className="mx-4 my-1">
          {commentFormLine!.startLine !== commentFormLine!.endLine && (
            <div className="text-xs mb-1" style={{ color: 'var(--color-accent)' }}>
              Lines {commentFormLine!.startLine}–{commentFormLine!.endLine}
            </div>
          )}
          <CommentForm
            onSubmit={({ body, severity }) => {
              handleAddComment(file.path, commentFormLine!.startLine, commentFormLine!.endLine, body, severity || 'suggestion');
            }}
            onCancel={onCancelComment}
          />
        </div>
      )}

      {lineComments.map((comment) => (
        <CommentThread
          key={comment.id}
          comment={comment}
          replies={repliesByParent.get(comment.id) || []}
          onReply={onReplyComment || (() => {})}
          onResolve={onResolveComment || (() => {})}
        />
      ))}
    </div>
  );
})}
```

Key interaction details:
- **Drag**: `onMouseDown` on "+" button (only when `!e.shiftKey`) calls `e.preventDefault()` (prevents text selection) then `onDragStart`. `onMouseEnter` on each diff line calls `onDragOver` (extends range while dragging). `onMouseUp` / global `window.mouseup` calls `onDragEnd`.
- **Shift-click**: `onMouseDown` skips when shift is held, letting the `onClick` handler fire `onLineClick` which extends range from the existing anchor.
- **Normal click**: Both `onMouseDown` (drag start) and `onClick` (line click) fire — both set the same single-line state, so they're idempotent.

**Step 3: Update the FileDiffComponent call site**

Replace lines 349-362:
```tsx
<FileDiffComponent
  file={file}
  commentsByFileLine={commentsByFileLine}
  repliesByParent={repliesByParent}
  commentFormLine={commentFormLine}
  commentRangeLines={commentRangeLines}
  onLineClick={handleLineClick}
  onDragStart={handleDragStart}
  onDragOver={handleDragOver}
  onDragEnd={handleDragEnd}
  onCancelComment={handleCancelComment}
  onAddComment={onAddComment}
  handleAddComment={handleAddComment}
  onReplyComment={onReplyComment}
  onResolveComment={onResolveComment}
  tokenizeLine={tokenizeLine}
  themeBg={themeBg}
  themeFg={themeFg}
/>
```

**Step 4: Run TypeScript check**

Run: `cd packages/frontend && npx tsc --noEmit 2>&1 | head -40`
Expected: Errors only in PRReview.tsx (still using old `line` shape). DiffViewer.tsx should be clean.

**Step 5: Commit**

```bash
git add packages/frontend/src/components/DiffViewer.tsx
git commit -m "feat: add range selection highlighting with shift-click and drag"
```

---

### Task 4: Update PRReview.tsx

**Files:**
- Modify: `packages/frontend/src/pages/PRReview.tsx:116-127`

**Step 1: Update handleAddComment signature**

Replace lines 116-127:
```tsx
const handleAddComment = async (data: { filePath: string; startLine: number; endLine: number; body: string; severity: string }) => {
  if (!prId) return;
  await api.comments.create(prId, {
    filePath: data.filePath,
    startLine: data.startLine,
    endLine: data.endLine,
    body: data.body,
    severity: data.severity,
    author: 'human',
  });
  await fetchComments();
};
```

**Step 2: Run TypeScript check**

Run: `cd packages/frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors (or only unrelated warnings).

**Step 3: Commit**

```bash
git add packages/frontend/src/pages/PRReview.tsx
git commit -m "feat: forward startLine/endLine in PRReview comment handler"
```

---

### Task 5: Show Line Range on CommentThread

**Files:**
- Modify: `packages/frontend/src/components/CommentThread.tsx:39-55`

**Step 1: Add range label after severity badge**

After line 51 (`</span>` closing the severity badge) and before line 52 (`{comment.resolved && (`), add:
```tsx
{comment.startLine !== comment.endLine && (
  <span className="text-xs opacity-50">
    L{comment.startLine}–{comment.endLine}
  </span>
)}
```

**Step 2: Run full build**

Run: `cd packages/frontend && npm run build 2>&1 | tail -10`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add packages/frontend/src/components/CommentThread.tsx
git commit -m "feat: display line range label on multi-line comments"
```

---

### Task 6: Manual Verification with Playwright

**Step 1: Start the dev servers**

Run: `cd packages/backend && npm run dev` (in background)
Run: `cd packages/frontend && npm run dev` (in background)

**Step 2: Open the app and navigate to a PR diff**

```bash
playwright-cli open http://localhost:3848
# Navigate to a PR with a diff
```

**Step 3: Test single-line comment (regression)**

- Hover over a diff line, click the "+" button
- Verify: form opens on that single line
- Type a comment and submit
- Verify: comment appears on the line

**Step 4: Test shift-click range selection**

- Click "+" on a line (e.g., line 10) — form opens for single line
- Press Cancel
- Click "+" on line 10 again (sets anchor)
- Shift-click "+" on line 15
- Verify: lines 10-15 are highlighted with blue tint
- Verify: form shows "Lines 10–15" label
- Type a comment and submit
- Verify: comment appears with "L10–15" range badge

**Step 5: Test click-and-drag range selection**

- Mousedown on "+" button of a line (e.g., line 5)
- Drag down to line 12 (hover over lines while holding mouse)
- Verify: lines 5-12 highlighted as you drag
- Release mouse
- Verify: form shows "Lines 5–12" label
- Cancel to reset

**Step 6: Test reverse order (shift-click)**

- Click "+" on line 20
- Shift-click "+" on line 15
- Verify: range is 15-20 (Math.min/max normalizes)

**Step 7: Test cross-file (should fall back to single line)**

- Click "+" on a line in file A
- Shift-click "+" on a line in file B
- Verify: single-line form opens in file B (no range)

**Step 8: Close**

```bash
playwright-cli close
```

**Step 9: Final commit (squash if preferred)**

All tasks already committed individually. Optionally squash into one commit.
