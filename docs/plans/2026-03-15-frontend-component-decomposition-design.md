# Frontend Component Decomposition Design

**Issue:** [#5 — Frontend components (DiffViewer, PRReview) getting too large](https://github.com/drewteeter/agent-shepherd/issues/5)
**Date:** 2026-03-15

## Problem

`diff-viewer.tsx` (1,476 lines) and `pr-review.tsx` (941 lines) have grown into monolithic files that mix pure logic, state management, and rendering. This makes them hard to reason about, test in isolation, and modify safely.

## Approach

Parallel extraction in two independent streams, each following logic → hooks → components order. The streams merge at the end when we simplify the DiffViewer prop interface.

## Scope

- Decompose `diff-viewer.tsx` and `pr-review.tsx` into focused modules
- Consolidate 5 comment callback props into a single `CommentActions` interface
- No functional changes — pure refactor

## Stream 1: DiffViewer Decomposition

### Pure Logic Modules

**`utils/diff-parser.ts`** (~130 lines)

- `parseDiff`, `parseDiffHeaderLine`, `parseDiffContentLine`, `createNewFile`
- Types: `DiffHunk`, `DiffLine`, `FileDiffData`, `FileStatus`, `DiffParserState`
- Exported: `parseDiff`, `FileDiffData`, `DiffHunk`, `DiffLine`, `FileStatus`

**`utils/comment-categorizer.ts`** (~100 lines)

- `categorizeComments`, `buildCommentRangeLines`, `buildValidLineKeys`, `appendToMap`, `categorizeComment`
- Takes a `Comment[]` and `FileDiffData[]`, returns categorized maps
- Exported: `categorizeComments` (the main entry point)

### Custom Hooks

**`hooks/use-line-selection.ts`** (~110 lines)

- Manages `commentFormLine`, `rangeAnchor`, `dragSelection`, `buttonsHidden`, `isDragging`, `dragAnchor` state
- Also manages `fileCommentFormPath` state for file-level comment forms
- Exposes: `handleLineClick`, `handleCancelComment`, `handleDragStart`, `handleDragOver`, `finalizeDrag`, `handleAddComment`, `handleFileComment`, `handleGlobalComment`, `fileCommentFormPath`, `setFileCommentFormPath`
- Registers the global `mouseup` listener for drag finalization
- Takes `onAddComment` and `onToggleGlobalCommentForm` callbacks as input

**`hooks/use-file-visibility.ts`** (~120 lines)

- Manages `visible` set, `measuredHeights`, `pinnedReference`, `isScrolling` ref, IntersectionObserver
- Contains `updateVisibleFiles`, `handleIntersectingEntry`, `handleNonIntersectingEntry` helper functions (these are tightly coupled to the observer callback)
- Handles scroll-to-file logic: pins the target file, uses `requestAnimationFrame` + 150ms follow-up scroll, gates scroll handler via `isScrolling` ref
- Handles visible-file-change detection: listens to container scroll events, finds closest file by `getBoundingClientRect`, calls `onVisibleFileChange`
- Takes: `parsedFiles`, `scrollToFile`, `scrollKey`, `onVisibleFileChange`
- Returns: `visible`, `measuredHeights`, `containerRef`, `fileRefs`, `createFileRefCallback`

### Subcomponents

**`components/global-comments.tsx`** (~50 lines)

- Renders the PR-level comment section at the top of the diff viewer
- Shows existing global comments as `CommentThread` components
- Shows the global `CommentForm` when `globalCommentForm` is true
- Props: `comments`, `repliesByParent`, `commentActions`, `canEditComments`, `threadStatusMap`, `globalCommentForm`, `onToggleGlobalCommentForm`, `onSubmit`

**`components/file-group-header.tsx`** (~40 lines)

- Renders logical group headers between file diffs when `viewMode === 'logical'`
- Shows group name, optional description, or "Other Changes" for ungrouped files
- Props: `group`, `isNewGroup`, `isUngrouped`

**`components/orphaned-comments.tsx`** (~50 lines)

- Renders comments on files/lines no longer present in the current diff
- Used both within `FileDiffComponent` (per-file orphans) and at the bottom of `DiffViewer` (files not in diff at all)
- Props: `comments`, `repliesByParent`, `commentActions`, `canEditComments`, `threadStatusMap`, `filePath?`

### Shared Types

**`components/diff-viewer-types.ts`** (~30 lines)

- `CommentActions` interface consolidating 5 callbacks: `onAdd`, `onReply`, `onResolve`, `onEdit`, `onDelete`
- `AddCommentData` interface
- Re-exports `FileDiffData` and `FileStatus` from `utils/diff-parser.ts`

### What Stays in `diff-viewer.tsx` (~350 lines)

- `DiffViewer` component: orchestrates hooks, renders file list with virtualization placeholders
- `FileDiffComponent`: renders a single file's hunks and inline comments (already extracted as an internal component; stays in this file since it's tightly coupled to DiffViewer's state)
- `HighlightedContent`: small presentational component for syntax-highlighted tokens
- `fileToGroup` useMemo: maps file paths to their logical group metadata (stays here since it's used in the render loop)
- `parsedFiles` useMemo: parses and sorts files by view mode (stays here as the central data pipeline)
- Utility functions: `sortedCopy`, `borderLeftForLineType`, `colorForLineType`, `symbolForLineType`, `sideForLineType`, `backgroundForSelection`, `noopCallback` — these are small, file-local helpers that don't warrant their own module

## Stream 2: PRReview Decomposition

### Custom Hooks

**`hooks/use-pr-data.ts`** (~220 lines)

- Consolidates most state variables from `PRReview` (excludes `scrollToFile`, `scrollKey`, `visibleFile` which stay as local UI state in `pr-review.tsx`)
- Contains interfaces: `ReviewCycle`, `PrData`, `DiffData`, `WsMessageData`
- Contains helper functions: `formatAgentError`, `sortedByCycleNumber`
- Contains all fetch functions: `fetchComments`, `fetchCycles`, `fetchInsights`, `fetchDiff`
- Contains all API handlers: `handleAddComment`, `handleReplyComment`, `handleResolveComment`, `handleEditComment`, `handleDeleteComment`, `handleReview`, `handleCancelAgent`, `handleRunAnalyzer`, `handleCancelAnalyzer`, `handleClosePr`, `handleReopenPr`
- Contains WebSocket event handling
- Contains derived data computations: `fileStatuses`, `latestCycle`, `threadStatusMap`, `selectedCycleData`, `filterCounts`, `filteredComments`, `commentCounts`, `topLevelComments`
- Manages `viewMode` and `fileGroups` state (set during `fetchDiff`), exposes `viewMode`, `fileGroups`, and `onViewModeChange` (the `setViewMode` setter)
- Takes: `prId` (from route params)
- Returns a flat object with all state, handlers, and derived data needed by subcomponents

### Subcomponents

**`components/pr-header.tsx`** (~170 lines)

- PR title with "Comment on PR" button
- Close/Reopen button
- Status badge and branch info
- Cycle selector dropdown with complex option-building logic: per-cycle snapshots, inter-cycle diffs, "since last review" option (~100 lines of the cycle selector alone)
- Snapshot/resubmit context badges
- Computes `showCycleSelector` and `cyclesWithSnapshots` internally from the `cycles` prop
- Props: `pr`, `selectedCycle`, `selectedCycleData`, `cycles`, `diffLoading`, `diffError`, `globalCommentForm`, `agentWorking`, `onCycleChange`, `onToggleGlobalCommentForm`, `onClosePr`, `onReopenPr`

**`components/pr-tab-bar.tsx`** (~40 lines)

- Review and Insights tab buttons
- Activity pulse indicators (yellow dot when agent/analyzer is working)
- Props: `activeTab`, `onTabChange`, `agentWorking`, `analyzerRunning`

**`components/review-content.tsx`** (~80 lines)

- Agent status section
- Comment filter bar
- FileTree + DiffViewer side-by-side layout
- Diff error / unavailable diff states
- Props: `agentWorking`, `agentErrored`, `agentError`, `agentActivity`, `cycles`, `commentFilter`, `filterCounts`, `onFilterChange`, `onCancelAgent`, `diffData`, `diffError`, `fileStatuses`, `visibleFile`, `scrollToFile`, `scrollKey`, `commentActions`, `filteredComments`, `threadStatusMap`, `canEditComments`, `globalCommentForm`, `onToggleGlobalCommentForm`, `fileGroups`, `viewMode`, `onViewModeChange`, `commentCounts`, `onFileSelect`, `onVisibleFileChange`

**`components/insights-footer.tsx`** (~40 lines)

- Bottom bar for the Insights tab
- Run Analyzer / Cancel Analyzer buttons
- Props: `analyzerRunning`, `hasComments`, `onRunAnalyzer`, `onCancelAnalyzer`

### What Stays in `pr-review.tsx` (~200 lines)

- Route setup, `useParams`
- Calls `usePrData(prId)` hook
- Loading/error/not-found guards
- Top-level layout: PRHeader, TabBar, conditional ReviewContent or InsightsTab (existing external component — receives `insights`, `analyzerRunning`, `analyzerActivity`, `onCancelAnalyzer` from the hook), conditional ReviewBar or InsightsFooter
- Local UI state: `scrollToFile` (state), `scrollKey` (ref), `visibleFile` (state) — scroll coordination that bridges FileTree ↔ DiffViewer
- Passes `usePrData` return values through to all subcomponents including `InsightsTab`

## Interface Simplification

Current DiffViewer prop count: **16**
After refactor: **~10**

```typescript
// Before: 5 separate callback props
onAddComment?: (data: AddCommentData) => void;
onReplyComment?: (commentId: string, body: string) => void;
onResolveComment?: (commentId: string) => void;
onEditComment?: (commentId: string, body: string) => void;
onDeleteComment?: (commentId: string) => void;

// After: 1 CommentActions object
commentActions?: CommentActions;
```

The `CommentActions` interface is defined in `diff-viewer-types.ts` and used by both `DiffViewer` and `PRReview`.

## File Inventory

New files created (13 total):

| File                               | Type       | ~Lines |
| ---------------------------------- | ---------- | ------ |
| `utils/diff-parser.ts`             | Pure logic | 130    |
| `utils/comment-categorizer.ts`     | Pure logic | 100    |
| `hooks/use-line-selection.ts`      | Hook       | 110    |
| `hooks/use-file-visibility.ts`     | Hook       | 120    |
| `hooks/use-pr-data.ts`             | Hook       | 220    |
| `components/diff-viewer-types.ts`  | Types      | 30     |
| `components/global-comments.tsx`   | Component  | 50     |
| `components/file-group-header.tsx` | Component  | 40     |
| `components/orphaned-comments.tsx` | Component  | 50     |
| `components/pr-header.tsx`         | Component  | 170    |
| `components/pr-tab-bar.tsx`        | Component  | 40     |
| `components/review-content.tsx`    | Component  | 80     |
| `components/insights-footer.tsx`   | Component  | 40     |

All paths are relative to `packages/frontend/src/`.

Modified files (2):

- `components/diff-viewer.tsx`: 1,476 → ~350 lines
- `pages/pr-review.tsx`: 941 → ~200 lines

## Test Strategy

- **Pure logic modules** (`diff-parser.ts`, `comment-categorizer.ts`): Unit tests can be extracted from existing `diff-viewer.test.tsx` or written fresh — these are pure functions with clear inputs/outputs.
- **Hooks** (`use-line-selection.ts`, `use-file-visibility.ts`, `use-pr-data.ts`): Test with `renderHook` from `@testing-library/react`.
- **Subcomponents**: Existing integration tests in `diff-viewer.test.tsx` and `pr-review.test.tsx` should continue to pass since behavior is unchanged.
- **Coverage**: Maintain 80% threshold. Pure logic extractions should make coverage easier to achieve since functions are independently testable.

## Non-Goals

- No changes to `file-tree.tsx`, `insights-tab.tsx`, or other components
- No introduction of React context or state management libraries
- No functional changes — this is a pure refactor
