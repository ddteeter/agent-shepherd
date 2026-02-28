# Cycle-Aware Comment Tracking

## Problem

After an agent submits changes and a new review cycle begins, the reviewer sees all comments mixed together with no indication of which ones the agent addressed, which are still unaddressed, or what's new. This makes re-review slow and error-prone.

## Solution

Computed thread status badges + a filter bar, with file tree counts reflecting the active filter. Purely frontend — no schema or API changes.

## Thread Status Logic

Each top-level comment thread gets one computed status derived from existing data:

| Status | Condition | Visual |
|--------|-----------|--------|
| **Resolved** | `resolved === true` | Dimmed (reduced opacity), collapsed by default |
| **Agent Replied** | Has child with `author === 'agent'`, not resolved | Blue "Agent Replied" badge |
| **Needs Attention** | No agent child, not resolved, from a previous cycle | Amber "Unaddressed" badge |
| **New** | Created in current cycle by human, not resolved | No badge (obviously new) |

### Derivation

1. Group comments into threads (top-level + their children via `parentCommentId`)
2. For each thread, check `resolved` flag on the top-level comment
3. Check if any child has `author === 'agent'`
4. Compare top-level comment's `reviewCycleId` to the current cycle to determine "previous" vs "current"

### Edge Cases

- First cycle (no previous): all human comments are "New"
- PR-level comments (no file path): same status logic applies
- Agent-authored top-level comments: treated as informational, no status badge needed
- Human replies after agent reply: thread still shows "Agent Replied" (human can resolve or next cycle picks it up)

## Filter Bar

Segmented control placed above the comment list area:

- **All** (default): Shows everything. Resolved threads dimmed/collapsed.
- **Needs Attention**: Shows "Needs Attention" + "New" threads only (actionable items).
- **Agent Replied**: Shows threads where agent responded (for verifying agent's work).

## File Tree Integration

File tree badge counts update based on the active filter:
- "All" filter: total comment thread count per file (current behavior)
- "Needs Attention" filter: only threads needing attention per file
- "Agent Replied" filter: only agent-replied threads per file
- Files with zero matching threads hide their badge (or show no badge)

## Data Flow

No API or schema changes. Existing `GET /api/prs/:prId/comments` already returns all needed fields: `reviewCycleId`, `author`, `parentCommentId`, `resolved`.

### Frontend Computation

1. `comments` array from existing API call (unchanged)
2. New `useMemo` groups comments into threads with computed `status`
3. Filter bar state (`all` | `needs-attention` | `agent-replied`) controls visibility
4. `commentCounts` for file tree computed from **filtered** threads
5. DiffViewer receives filtered comments
6. Resolved threads in "All" view: dimmed + collapsed (expandable on click)

### Current Cycle

Current cycle number already available from PR review cycle data. Used to distinguish "previous cycle" (where agent worked) from "current cycle" (current review round).

## Components Affected

- `PRReview.tsx`: Add filter state, thread grouping logic, pass filtered comments
- `DiffViewer` / comment rendering components: Add status badges, dimmed/collapsed resolved treatment
- `FileTree` component: Derive counts from filtered comments instead of all comments
- New: Filter bar component (or inline in review bar)

## Out of Scope

- Server-side filtering or new API endpoints
- Schema changes or migrations
- Per-cycle timeline/history view (potential future enhancement)
- Collapsible file sections in diff view based on comment status
