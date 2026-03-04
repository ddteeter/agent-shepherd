# Pull-Based Comment Fetching for Agent Reviews

**Date:** 2026-03-04
**Status:** Design

## Problem

When the orchestrator spawns a Claude Code session to address review comments, it currently dumps all comments into the prompt. On large PRs with many comments across many files, the agent front-loads by reading all mentioned files at once, polluting its context window before it starts making changes. This leads to:

- Context window exhaustion on large reviews
- Diffused focus — the agent holds everything in mind rather than working incrementally
- Risk of losing early work details to context compaction before writing the final response JSON
- Worse outcomes as review size increases

## Solution

Replace the push-all-comments model with a pull-based approach. The initial prompt contains only PR metadata, a comment summary (counts + file list), and the skill documentation. The agent fetches full comment details incrementally via CLI commands as it works through each file.

## Design

### 1. New CLI Command: `shepherd review <pr-id> comments`

A new command group `review` with a `comments` subcommand. Flags:

| Flag | Description |
|------|-------------|
| `--summary` | Output comment counts by severity + file list with per-file counts. No comment bodies. |
| `--file <path>` | Filter to comments on a specific file path. |
| `--severity <level>` | Filter to a specific severity: `must-fix`, `request`, or `suggestion`. |
| `--all` | Fetch all comments (escape hatch for cross-references between files). |
| (no flags) | Same as `--all`. |

**Output format** — structured text, not JSON, so the agent reads it naturally:

```
# Review Comments for: Fix auth token validation (14 comments)

## Summary
- 6 must-fix
- 5 request
- 3 suggestion

## Files (in diff order)
1. src/routes/auth.ts (4 comments: 2 must-fix, 1 request, 1 suggestion)
2. src/middleware/session.ts (3 comments: 2 must-fix, 1 request)
3. src/services/token.ts (2 comments: 1 request, 1 suggestion)
...
```

When `--file` is specified, output includes full comment details:

```
# Comments for: src/routes/auth.ts

[MUST FIX] Line 42 (comment ID: abc-123)
> The token expiry check is comparing milliseconds to seconds. This will reject all valid tokens.

[REQUEST] Lines 58-62 (comment ID: def-456)
> Extract this validation logic into a shared utility — it's duplicated in session.ts.
Thread:
  - agent: I put it inline because the two checks are subtly different.
  - human: Look again — lines 58-62 here and lines 30-34 in session.ts are identical.

[SUGGESTION] Line 89 (comment ID: ghi-789)
> Consider using a constant for the 3600 magic number.
```

**Ordering** — comments are returned top-down:
1. General (no-file) comments first
2. Files in diff order (not alphabetical)
3. Within each file, by line number ascending

This mirrors the order the human reviewed in, so cross-references like "same issue as above" resolve naturally.

### 2. API Enhancement: Query Params on `GET /api/prs/:prId/comments`

Add optional query parameters to the existing endpoint:

| Param | Type | Description |
|-------|------|-------------|
| `filePath` | string | Filter to comments on this file |
| `severity` | string | Filter to this severity level |
| `summary` | boolean | Return only counts and file list, no comment bodies |

The `summary=true` response shape:

```json
{
  "total": 14,
  "bySeverity": { "must-fix": 6, "request": 5, "suggestion": 3 },
  "files": [
    { "path": "src/routes/auth.ts", "count": 4, "bySeverity": { "must-fix": 2, "request": 1, "suggestion": 1 } },
    { "path": "src/middleware/session.ts", "count": 3, "bySeverity": { "must-fix": 2, "request": 1 } }
  ],
  "generalCount": 2
}
```

File ordering in the summary requires knowing the diff file order. The endpoint will look up the latest cycle's diff snapshot (or compute a live diff) and use `extractFilesFromDiff` to determine ordering. Comments on files not in the diff sort to the end.

**Filtering behavior:** All filters apply to unresolved, top-level (non-reply) comments only — matching what the orchestrator currently passes to the prompt builder. Thread replies are included inline with their parent.

### 3. Prompt Builder Changes

The `buildReviewPrompt` function changes to produce a slim prompt:

**Keeps:**
- PR title, ID, context section
- "IMPORTANT: Read This First" section (updated for pull-based workflow)
- Full skill documentation (severity handling, reply format, common mistakes)

**Removes:**
- The entire `## Comments` section with all comment bodies

**Adds:**
- A `## Comment Summary` section with counts by severity and file list with per-file counts (generated at prompt build time)
- Updated workflow instructions describing the pull-based pattern

**New `PromptInput` interface** adds:

```typescript
interface CommentSummary {
  total: number;
  bySeverity: Record<string, number>;
  files: Array<{ path: string; count: number; bySeverity: Record<string, number> }>;
  generalCount: number;
}

interface PromptInput {
  prId: string;
  prTitle: string;
  agentContext: string | null;
  commentSummary: CommentSummary;  // replaces comments: ReviewComment[]
}
```

### 4. Updated Skill Workflow in Prompt

The step-by-step workflow section changes from "read all comments, then work" to:

```
### Step-by-Step Workflow

1. Run `shepherd review <pr-id> comments --summary` to see what's outstanding
2. Work through files top-to-bottom as listed in the summary
3. For each file:
   a. Run `shepherd review <pr-id> comments --file <path>` to get that file's comments
   b. Read the file and make the requested changes
   c. Reply to those comments immediately:
      echo '{"replies":[...]}' | shepherd batch <pr-id> --stdin
   d. Move to the next file
4. After all files are addressed, commit your changes
5. Run `shepherd ready <pr-id>` to signal completion

Reply to comments as you finish each file — do not wait until the end.
This prevents losing reply details to context compaction on large reviews.

If a comment references another file's comment and you need more context,
use `shepherd review <pr-id> comments --all` to fetch everything.
```

### 5. Orchestrator Changes

The `handleRequestChanges` method in `Orchestrator` changes:

- Instead of fetching all comments and building `ReviewComment[]`, it fetches the comment summary (counts + file list)
- Passes `commentSummary` to `buildReviewPrompt` instead of `comments`
- The diff file ordering is computed here (from the latest cycle's diff snapshot) and passed into the summary

### 6. Incremental Replies

No new infrastructure needed. The existing `shepherd batch` command already supports partial submissions. The agent calls it after each file with just that file's replies. The `shepherd ready` call at the end signals completion without needing a `--file` flag since all replies have already been submitted.

## What Stays the Same

- `shepherd batch` and `shepherd ready` commands — unchanged
- `review-response.json` format — still works (agent can use it for small PRs)
- Claude Code adapter — unchanged (`Bash(agent-shepherd:*)` already covers new commands)
- Comment DB schema — unchanged
- WebSocket events — unchanged
- The skill documentation sections on severity handling, reply format, and common mistakes — kept in prompt

## Component Summary

| Component | Change |
|-----------|--------|
| `packages/cli/src/commands/review.ts` | **New** — `shepherd review <pr-id> comments` command with `--summary`, `--file`, `--severity`, `--all` flags |
| `packages/backend/src/routes/comments.ts` | **Modified** — add `filePath`, `severity`, `summary` query params to GET endpoint |
| `packages/backend/src/orchestrator/prompt-builder.ts` | **Modified** — accept `CommentSummary` instead of `ReviewComment[]`, generate slim prompt with summary + pull-based workflow |
| `packages/backend/src/orchestrator/index.ts` | **Modified** — compute comment summary + diff file ordering instead of full comment list |
| `packages/backend/src/routes/diff.ts` | **Minor** — export `extractFilesFromDiff` for reuse by orchestrator |
