# Cycle-Aware Comment Tracking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show per-thread status badges ("Agent Replied", "Unaddressed") and a filter bar so reviewers can quickly see what changed in each review cycle.

**Architecture:** Purely frontend. Derive thread statuses from existing comment data (`reviewCycleId`, `author`, `parentCommentId`, `resolved`). Add filter bar in PRReview page, update file tree counts to reflect active filter. No schema/API changes.

**Tech Stack:** React 19, TypeScript, Vitest + React Testing Library

---

### Task 1: Add `reviewCycleId` to frontend Comment type

The shared `Comment` type (`packages/shared/src/types.ts:46-58`) has `reviewCycleId`, but the frontend's local `Comment` interface (`packages/frontend/src/components/CommentThread.tsx:4-15`) omits it. The API already returns this field.

**Files:**

- Modify: `packages/frontend/src/components/CommentThread.tsx:4-15`
- Verify: `packages/frontend/src/components/__tests__/CommentThread.test.tsx` (update `makeComment` helper)

**Step 1: Add `reviewCycleId` to the Comment interface**

In `packages/frontend/src/components/CommentThread.tsx`, add `reviewCycleId: string;` to the `Comment` interface between `id` and `filePath`:

```typescript
interface Comment {
  id: string;
  reviewCycleId: string;
  filePath: string | null;
  startLine: number | null;
  endLine: number | null;
  body: string;
  severity: string;
  author: string;
  parentCommentId: string | null;
  resolved: boolean;
  createdAt: string;
}
```

**Step 2: Update `makeComment` helper in tests**

In `packages/frontend/src/components/__tests__/CommentThread.test.tsx`, add `reviewCycleId: 'cycle-1'` to the `makeComment` default:

```typescript
function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c1',
    reviewCycleId: 'cycle-1',
    filePath: 'src/index.ts',
    // ... rest unchanged
    ...overrides,
  };
}
```

**Step 3: Run tests to verify nothing breaks**

Run: `npm run test --workspace=packages/frontend -- --run`
Expected: All existing tests PASS (the new field is not used by any rendering logic yet)

**Step 4: Commit**

```bash
git add packages/frontend/src/components/CommentThread.tsx packages/frontend/src/components/__tests__/CommentThread.test.tsx
git commit -m "feat: add reviewCycleId to frontend Comment type"
```

---

### Task 2: Create thread status derivation utility with tests

Pure utility function that computes thread statuses from comments + current cycle ID. Fully testable with no React dependency.

**Files:**

- Create: `packages/frontend/src/utils/commentThreadStatus.ts`
- Create: `packages/frontend/src/utils/__tests__/commentThreadStatus.test.ts`

**Step 1: Write the failing tests**

Create `packages/frontend/src/utils/__tests__/commentThreadStatus.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  getThreadStatus,
  groupThreads,
  type ThreadStatus,
} from '../commentThreadStatus.js';
import type { Comment } from '../../components/CommentThread.js';

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c1',
    reviewCycleId: 'cycle-1',
    filePath: 'src/index.ts',
    startLine: 10,
    endLine: 10,
    body: 'Test',
    severity: 'suggestion',
    author: 'human',
    parentCommentId: null,
    resolved: false,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('getThreadStatus', () => {
  it('returns "resolved" when top-level comment is resolved', () => {
    const comment = makeComment({ resolved: true });
    const replies: Comment[] = [];
    expect(getThreadStatus(comment, replies, 'cycle-2')).toBe('resolved');
  });

  it('returns "agent-replied" when thread has agent reply and is not resolved', () => {
    const comment = makeComment({ reviewCycleId: 'cycle-1' });
    const replies = [
      makeComment({ id: 'r1', author: 'agent', parentCommentId: 'c1' }),
    ];
    expect(getThreadStatus(comment, replies, 'cycle-2')).toBe('agent-replied');
  });

  it('returns "needs-attention" when no agent reply and from a previous cycle', () => {
    const comment = makeComment({ reviewCycleId: 'cycle-1' });
    const replies: Comment[] = [];
    expect(getThreadStatus(comment, replies, 'cycle-2')).toBe(
      'needs-attention',
    );
  });

  it('returns "new" when comment is from the current cycle', () => {
    const comment = makeComment({ reviewCycleId: 'cycle-2' });
    const replies: Comment[] = [];
    expect(getThreadStatus(comment, replies, 'cycle-2')).toBe('new');
  });

  it('returns "new" when there is only one cycle (first review)', () => {
    const comment = makeComment({ reviewCycleId: 'cycle-1' });
    const replies: Comment[] = [];
    expect(getThreadStatus(comment, replies, 'cycle-1')).toBe('new');
  });

  it('resolved takes priority over agent-replied', () => {
    const comment = makeComment({ resolved: true, reviewCycleId: 'cycle-1' });
    const replies = [
      makeComment({ id: 'r1', author: 'agent', parentCommentId: 'c1' }),
    ];
    expect(getThreadStatus(comment, replies, 'cycle-2')).toBe('resolved');
  });

  it('human-only replies do not count as agent-replied', () => {
    const comment = makeComment({ reviewCycleId: 'cycle-1' });
    const replies = [
      makeComment({ id: 'r1', author: 'human', parentCommentId: 'c1' }),
    ];
    expect(getThreadStatus(comment, replies, 'cycle-2')).toBe(
      'needs-attention',
    );
  });
});

describe('groupThreads', () => {
  it('groups top-level comments with their replies', () => {
    const comments = [
      makeComment({ id: 'c1' }),
      makeComment({ id: 'r1', parentCommentId: 'c1' }),
      makeComment({ id: 'c2', filePath: null, startLine: null, endLine: null }),
    ];
    const threads = groupThreads(comments);
    expect(threads).toHaveLength(2);
    expect(threads[0].comment.id).toBe('c1');
    expect(threads[0].replies).toHaveLength(1);
    expect(threads[1].comment.id).toBe('c2');
    expect(threads[1].replies).toHaveLength(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=packages/frontend -- --run src/utils/__tests__/commentThreadStatus.test.ts`
Expected: FAIL (module not found)

**Step 3: Write the implementation**

Create `packages/frontend/src/utils/commentThreadStatus.ts`:

```typescript
import type { Comment } from '../components/CommentThread.js';

export type ThreadStatus =
  | 'resolved'
  | 'agent-replied'
  | 'needs-attention'
  | 'new';

export interface CommentThread {
  comment: Comment;
  replies: Comment[];
  status: ThreadStatus;
}

export function getThreadStatus(
  comment: Comment,
  replies: Comment[],
  currentCycleId: string,
): ThreadStatus {
  if (comment.resolved) return 'resolved';

  const hasAgentReply = replies.some((r) => r.author === 'agent');
  if (hasAgentReply) return 'agent-replied';

  if (comment.reviewCycleId === currentCycleId) return 'new';

  return 'needs-attention';
}

export function groupThreads(comments: Comment[]): CommentThread[] {
  const topLevel: Comment[] = [];
  const repliesByParent = new Map<string, Comment[]>();

  for (const c of comments) {
    if (c.parentCommentId) {
      const existing = repliesByParent.get(c.parentCommentId) || [];
      existing.push(c);
      repliesByParent.set(c.parentCommentId, existing);
    } else {
      topLevel.push(c);
    }
  }

  return topLevel.map((comment) => {
    const replies = repliesByParent.get(comment.id) || [];
    return {
      comment,
      replies,
      // Status will be set by caller with currentCycleId — use 'new' as placeholder
      status: 'new' as ThreadStatus,
    };
  });
}
```

Note: `groupThreads` doesn't compute status because it doesn't have `currentCycleId`. The caller will use `getThreadStatus` separately. But for convenience in the test, we only test the grouping part.

**Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=packages/frontend -- --run src/utils/__tests__/commentThreadStatus.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/frontend/src/utils/commentThreadStatus.ts packages/frontend/src/utils/__tests__/commentThreadStatus.test.ts
git commit -m "feat: add thread status derivation utility"
```

---

### Task 3: Create CommentFilter component with tests

A segmented control for filtering comment threads by status.

**Files:**

- Create: `packages/frontend/src/components/CommentFilter.tsx`
- Create: `packages/frontend/src/components/__tests__/CommentFilter.test.tsx`

**Step 1: Write the failing tests**

Create `packages/frontend/src/components/__tests__/CommentFilter.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommentFilter } from '../CommentFilter.js';

describe('CommentFilter', () => {
  it('renders three filter buttons', () => {
    render(<CommentFilter activeFilter="all" onFilterChange={() => {}} counts={{ all: 5, needsAttention: 2, agentReplied: 3 }} />);
    expect(screen.getByRole('button', { name: /all/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /needs attention/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /agent replied/i })).toBeInTheDocument();
  });

  it('shows counts on each button', () => {
    render(<CommentFilter activeFilter="all" onFilterChange={() => {}} counts={{ all: 5, needsAttention: 2, agentReplied: 3 }} />);
    expect(screen.getByRole('button', { name: /all/i })).toHaveTextContent('5');
    expect(screen.getByRole('button', { name: /needs attention/i })).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: /agent replied/i })).toHaveTextContent('3');
  });

  it('calls onFilterChange when a filter button is clicked', async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();
    render(<CommentFilter activeFilter="all" onFilterChange={onFilterChange} counts={{ all: 5, needsAttention: 2, agentReplied: 3 }} />);
    await user.click(screen.getByRole('button', { name: /needs attention/i }));
    expect(onFilterChange).toHaveBeenCalledWith('needs-attention');
  });

  it('visually marks the active filter', () => {
    render(<CommentFilter activeFilter="needs-attention" onFilterChange={() => {}} counts={{ all: 5, needsAttention: 2, agentReplied: 3 }} />);
    const btn = screen.getByRole('button', { name: /needs attention/i });
    expect(btn.getAttribute('data-active')).toBe('true');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=packages/frontend -- --run src/components/__tests__/CommentFilter.test.tsx`
Expected: FAIL (module not found)

**Step 3: Write the implementation**

Create `packages/frontend/src/components/CommentFilter.tsx`:

```tsx
export type CommentFilterValue = 'all' | 'needs-attention' | 'agent-replied';

interface CommentFilterProps {
  activeFilter: CommentFilterValue;
  onFilterChange: (filter: CommentFilterValue) => void;
  counts: {
    all: number;
    needsAttention: number;
    agentReplied: number;
  };
}

const filters: {
  value: CommentFilterValue;
  label: string;
  countKey: keyof CommentFilterProps['counts'];
}[] = [
  { value: 'all', label: 'All', countKey: 'all' },
  {
    value: 'needs-attention',
    label: 'Needs Attention',
    countKey: 'needsAttention',
  },
  { value: 'agent-replied', label: 'Agent Replied', countKey: 'agentReplied' },
];

export function CommentFilter({
  activeFilter,
  onFilterChange,
  counts,
}: CommentFilterProps) {
  return (
    <div className="flex gap-1 p-2" role="group" aria-label="Comment filter">
      {filters.map(({ value, label, countKey }) => {
        const isActive = activeFilter === value;
        return (
          <button
            key={value}
            data-active={isActive}
            onClick={() => onFilterChange(value)}
            className="text-xs px-2.5 py-1 rounded border font-medium transition-colors"
            style={{
              borderColor: isActive
                ? 'var(--color-accent)'
                : 'var(--color-border)',
              backgroundColor: isActive
                ? 'rgba(9, 105, 218, 0.1)'
                : 'transparent',
              color: isActive ? 'var(--color-accent)' : 'var(--color-text)',
            }}
          >
            {label} ({counts[countKey]})
          </button>
        );
      })}
    </div>
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=packages/frontend -- --run src/components/__tests__/CommentFilter.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/frontend/src/components/CommentFilter.tsx packages/frontend/src/components/__tests__/CommentFilter.test.tsx
git commit -m "feat: add CommentFilter segmented control component"
```

---

### Task 4: Add status badge to CommentThread component

Add an optional `status` prop to `CommentThread` that renders a colored badge and controls dimming/collapsing for resolved threads.

**Files:**

- Modify: `packages/frontend/src/components/CommentThread.tsx`
- Modify: `packages/frontend/src/components/__tests__/CommentThread.test.tsx`

**Step 1: Write the failing tests**

Add to `packages/frontend/src/components/__tests__/CommentThread.test.tsx`:

```typescript
describe('CommentThread — status badges', () => {
  it('shows "Agent Replied" badge when status is agent-replied', () => {
    render(
      <CommentThread
        comment={makeComment()}
        replies={[]}
        onReply={() => {}}
        onResolve={() => {}}
        threadStatus="agent-replied"
      />,
    );
    expect(screen.getByText('Agent Replied')).toBeInTheDocument();
  });

  it('shows "Unaddressed" badge when status is needs-attention', () => {
    render(
      <CommentThread
        comment={makeComment()}
        replies={[]}
        onReply={() => {}}
        onResolve={() => {}}
        threadStatus="needs-attention"
      />,
    );
    expect(screen.getByText('Unaddressed')).toBeInTheDocument();
  });

  it('does not show a badge when status is new', () => {
    render(
      <CommentThread
        comment={makeComment()}
        replies={[]}
        onReply={() => {}}
        onResolve={() => {}}
        threadStatus="new"
      />,
    );
    expect(screen.queryByText('Agent Replied')).not.toBeInTheDocument();
    expect(screen.queryByText('Unaddressed')).not.toBeInTheDocument();
  });

  it('dims the thread when status is resolved', () => {
    const { container } = render(
      <CommentThread
        comment={makeComment({ resolved: true })}
        replies={[]}
        onReply={() => {}}
        onResolve={() => {}}
        threadStatus="resolved"
      />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.opacity).toBe('0.5');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=packages/frontend -- --run src/components/__tests__/CommentThread.test.tsx`
Expected: FAIL (threadStatus prop not recognized, badges not rendered)

**Step 3: Implement the status badge**

In `packages/frontend/src/components/CommentThread.tsx`:

1. Import the `ThreadStatus` type:

```typescript
import type { ThreadStatus } from '../utils/commentThreadStatus.js';
```

2. Add `threadStatus?: ThreadStatus` to `CommentThreadProps`:

```typescript
interface CommentThreadProps {
  comment: Comment;
  replies: Comment[];
  onReply: (commentId: string, body: string) => void;
  onResolve: (commentId: string) => void;
  onEdit?: (commentId: string, body: string) => void;
  onDelete?: (commentId: string) => void;
  canEdit?: boolean;
  threadStatus?: ThreadStatus;
}
```

3. Add `threadStatus` to the destructured props:

```typescript
export function CommentThread({ comment, replies, onReply, onResolve, onEdit, onDelete, canEdit = false, threadStatus }: CommentThreadProps) {
```

4. Add the status badge in the header (after the resolved span, before the edit button), and add opacity to the outer div for resolved:

In the outer `<div>`, add conditional opacity:

```tsx
<div
  className="my-2 mx-4 border rounded text-sm"
  style={{
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-bg)',
    opacity: threadStatus === 'resolved' ? 0.5 : 1,
  }}
>
```

Add the badge after the existing `{comment.resolved && ...}` span (around line 80):

```tsx
{
  threadStatus === 'agent-replied' && (
    <span
      className="text-xs px-1.5 py-0.5 rounded font-medium"
      style={{
        backgroundColor: 'rgba(9, 105, 218, 0.15)',
        color: 'var(--color-accent)',
      }}
    >
      Agent Replied
    </span>
  );
}
{
  threadStatus === 'needs-attention' && (
    <span
      className="text-xs px-1.5 py-0.5 rounded font-medium"
      style={{
        backgroundColor: 'rgba(210, 153, 34, 0.15)',
        color: 'var(--color-warning, #d29922)',
      }}
    >
      Unaddressed
    </span>
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=packages/frontend -- --run src/components/__tests__/CommentThread.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/frontend/src/components/CommentThread.tsx packages/frontend/src/components/__tests__/CommentThread.test.tsx
git commit -m "feat: add status badge and resolved dimming to CommentThread"
```

---

### Task 5: Wire filter state and thread statuses in PRReview.tsx

Connect everything: add filter state, compute thread statuses, filter comments, update counts.

**Files:**

- Modify: `packages/frontend/src/pages/PRReview.tsx`

**Step 1: Add imports**

At top of `PRReview.tsx`, add:

```typescript
import { CommentFilter } from '../components/CommentFilter.js';
import type { CommentFilterValue } from '../components/CommentFilter.js';
import { getThreadStatus, groupThreads } from '../utils/commentThreadStatus.js';
import type { ThreadStatus } from '../utils/commentThreadStatus.js';
```

**Step 2: Add filter state**

After the existing state declarations (around line 38), add:

```typescript
const [commentFilter, setCommentFilter] = useState<CommentFilterValue>('all');
```

**Step 3: Compute thread statuses**

After the existing `latestCycle` memo (around line 280), add a new memo that computes thread statuses and a status map:

```typescript
const threadStatusMap = useMemo(() => {
  const map = new Map<string, ThreadStatus>();
  if (!latestCycle) return map;
  const threads = groupThreads(comments);
  for (const thread of threads) {
    const status = getThreadStatus(
      thread.comment,
      thread.replies,
      latestCycle.id,
    );
    map.set(thread.comment.id, status);
  }
  return map;
}, [comments, latestCycle]);
```

**Step 4: Compute filter counts**

```typescript
const filterCounts = useMemo(() => {
  let all = 0;
  let needsAttention = 0;
  let agentReplied = 0;
  for (const [, status] of threadStatusMap) {
    all++;
    if (status === 'needs-attention' || status === 'new') needsAttention++;
    if (status === 'agent-replied') agentReplied++;
  }
  return { all, needsAttention, agentReplied };
}, [threadStatusMap]);
```

**Step 5: Filter comments based on active filter**

```typescript
const filteredComments = useMemo(() => {
  if (commentFilter === 'all') return comments;
  return comments.filter((c) => {
    // For replies, include if parent passes filter
    const parentId = c.parentCommentId || c.id;
    const status = threadStatusMap.get(parentId);
    if (!status) return true; // replies whose parent we can't find — include
    if (commentFilter === 'needs-attention') {
      return status === 'needs-attention' || status === 'new';
    }
    if (commentFilter === 'agent-replied') {
      return status === 'agent-replied';
    }
    return true;
  });
}, [comments, commentFilter, threadStatusMap]);
```

**Step 6: Update commentCounts to use filtered comments**

Change the existing `commentCounts` memo (line 267) to use `filteredComments` instead of `comments`:

```typescript
const commentCounts = useMemo(() => {
  const counts: Record<string, number> = {};
  for (const c of filteredComments) {
    if (c.filePath) {
      counts[c.filePath] = (counts[c.filePath] || 0) + 1;
    }
  }
  return counts;
}, [filteredComments]);
```

**Step 7: Pass filtered comments and threadStatusMap to DiffViewer**

Update the DiffViewer props:

```tsx
<DiffViewer
  diff={diffData.diff}
  files={diffData.files}
  scrollToFile={scrollToFile}
  scrollKey={scrollKeyRef.current}
  onVisibleFileChange={setVisibleFile}
  comments={filteredComments}
  threadStatusMap={threadStatusMap}
  onAddComment={handleAddComment}
  onReplyComment={handleReplyComment}
  onResolveComment={handleResolveComment}
  onEditComment={handleEditComment}
  onDeleteComment={handleDeleteComment}
  canEditComments={selectedCycle === 'current'}
  globalCommentForm={globalCommentForm}
  onToggleGlobalCommentForm={() => setGlobalCommentForm(!globalCommentForm)}
/>
```

**Step 8: Add filter bar to the UI**

Place the CommentFilter between the PR header and the main content area. Inside the header div (after the agent status section, around line 436), add:

```tsx
{
  cycles.length > 1 && (
    <CommentFilter
      activeFilter={commentFilter}
      onFilterChange={setCommentFilter}
      counts={filterCounts}
    />
  );
}
```

Only show when there are multiple cycles (first cycle has no filtering to do).

**Step 9: Run full test suite**

Run: `npm run test --workspace=packages/frontend -- --run`
Expected: PASS

**Step 10: Commit**

```bash
git add packages/frontend/src/pages/PRReview.tsx
git commit -m "feat: wire comment filter state and thread status computation"
```

---

### Task 6: Pass threadStatusMap through DiffViewer to CommentThread

DiffViewer needs to accept the status map and forward the appropriate status to each CommentThread it renders.

**Files:**

- Modify: `packages/frontend/src/components/DiffViewer.tsx`

**Step 1: Add threadStatusMap prop to DiffViewerProps**

In `DiffViewer.tsx`, add to the `DiffViewerProps` interface:

```typescript
threadStatusMap?: Map<string, import('../utils/commentThreadStatus.js').ThreadStatus>;
```

**Step 2: Destructure the new prop**

In the `DiffViewer` function signature, add `threadStatusMap` to destructured props.

**Step 3: Pass to every CommentThread render**

There are three places where `<CommentThread>` is rendered in DiffViewer:

1. **Global comments** (around line 631): Add `threadStatus={threadStatusMap?.get(comment.id)}` to each `<CommentThread>` in the `globalComments.map(...)`.

2. **File-level comments** (around line 212): These are rendered inside the `FileDiff` component. `threadStatusMap` needs to be passed through `FileDiff` props and then to each `<CommentThread>`.

3. **Line-level comments** (around line 326): Same — passed through `FileDiff` to `<CommentThread>`.

For the `FileDiff` sub-component (defined inside DiffViewer), add `threadStatusMap` to its props and pass it down. Then in each CommentThread usage:

```tsx
<CommentThread
  key={comment.id}
  comment={comment}
  replies={repliesByParent.get(comment.id) || []}
  onReply={onReplyComment || (() => {})}
  onResolve={onResolveComment || (() => {})}
  onEdit={onEditComment}
  onDelete={onDeleteComment}
  canEdit={canEditComments}
  threadStatus={threadStatusMap?.get(comment.id)}
/>
```

**Step 4: Run tests**

Run: `npm run test --workspace=packages/frontend -- --run`
Expected: PASS (existing DiffViewer tests pass — the new prop is optional)

**Step 5: Manual verification**

Run: `npm run dev`

- Open a PR with multiple review cycles
- Verify badges appear on comment threads
- Verify filter bar appears when cycles > 1
- Verify file tree counts update when filter changes
- Verify resolved threads are dimmed

**Step 6: Commit**

```bash
git add packages/frontend/src/components/DiffViewer.tsx
git commit -m "feat: pass thread status through DiffViewer to CommentThread badges"
```

---

### Task 7: Run all tests and verify

**Step 1: Run full test suite**

Run: `npm run test -- --run`
Expected: All tests PASS

**Step 2: Build check**

Run: `npm run build`
Expected: Clean build with no TypeScript errors

**Step 3: Commit any remaining fixes if needed**

---

## Summary of Changes

| File                                                 | Change                                                                            |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| `packages/frontend/src/components/CommentThread.tsx` | Add `reviewCycleId` to Comment type, add `threadStatus` prop with badge + dimming |
| `packages/frontend/src/utils/commentThreadStatus.ts` | New: thread status derivation logic                                               |
| `packages/frontend/src/components/CommentFilter.tsx` | New: filter bar segmented control                                                 |
| `packages/frontend/src/pages/PRReview.tsx`           | Add filter state, compute statuses, filter comments, update counts                |
| `packages/frontend/src/components/DiffViewer.tsx`    | Accept + pass through `threadStatusMap`                                           |
| Test files                                           | New tests for utility + filter component, updated CommentThread tests             |
