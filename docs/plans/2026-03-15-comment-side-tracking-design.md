# Comment Side Tracking Design

**Issue:** [#13](https://github.com/ddteeter/agent-shepherd/issues/13) — Multi-line highlight comments on deleted+added sections show controls on both sides instead of only the targeted side.

**Date:** 2026-03-15

## Problem

Comments are keyed by `file:lineNumber` with no concept of which side of the diff they belong to. When removed and added lines share the same line number, a comment on one side incorrectly appears on both.

## Approach

Add a `side` field (`'old' | 'new' | null`) across the full stack and constrain multi-line selections to a single side.

## Data Model

- Add `side text('side')` column to `comments` table (nullable for backward compat — file-level and global comments have no side)
- Add `side: 'old' | 'new' | null` to `Comment` interface and `CreateCommentInput` in shared types
- Generate a Drizzle migration for the new column

## API Layer

- Comment creation route (`POST /api/prs/:prId/comments`) accepts optional `side` field, passes through to DB insert
- Batch comment route (`POST /api/prs/:prId/comments/batch`) — same treatment
- No extra validation needed; `side` is only meaningful when `startLine` is present

## Frontend — Selection Constraint

- Track the side of the selection anchor on drag/click start. Derive from line type: `remove` -> `old`, else -> `new`
- When extending a drag (`onDragOver`), skip lines whose side doesn't match the anchor side
- Shift-click follows the same rule: target must match anchor side
- Pass `side` through to `onAddComment` callback alongside `startLine`/`endLine`

## Frontend — Comment Matching

- Line keys change from `file:lineNo` to `file:lineNo:old` or `file:lineNo:new`
- `buildValidLineKeys` uses line type to determine side and includes it in the key
- `categorizeComment` builds key using `comment.side` (falls back to `new` for null/legacy comments)
- `buildCommentRangeLines` includes side in its keys
- Context lines use side `new`

## Testing

- Unit tests for `buildValidLineKeys` — verify keys include side
- Unit tests for `categorizeComment` — verify old-side comments don't appear on new-side lines with same number
- Unit tests for selection constraint — verify cross-side drag doesn't extend range
- Backend route tests for `side` field round-trip (create -> query -> verify)
