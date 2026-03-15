# Question Comment Type — Design

GitHub Issue: #8

## Overview

Add a `question` comment type to Agent Shepherd and rename the existing `severity` field to `type` across the codebase. Update the insights system to filter out configurable comment types (defaulting to `question` only).

## Motivation

The current severity system (`suggestion | request | must-fix`) assumes every comment is actionable feedback. A `question` type lets reviewers ask for clarification without implying a change is needed. Additionally, the insights analyzer shouldn't try to derive workflow improvements from exploratory questions — they haven't been decided as needing to be addressed.

The rename from `severity` to `type` reflects that the field no longer represents a strict urgency hierarchy — `question` isn't a severity level.

## Changes

### 1. Shared Types & Rename

Rename `CommentSeverity` to `CommentType` and add `question`:

```typescript
export type CommentType = 'question' | 'suggestion' | 'request' | 'must-fix';
```

All references to `CommentSeverity` across the codebase become `CommentType`. The `Comment` interface field `severity` becomes `type`. `BatchCommentPayload` and `CreateCommentInput` fields update. `CommentSummary` renames `bySeverity` to `byType` (including the nested per-file field).

### 2. Database Migration

Rename the `severity` column to `type` in the `comments` table:

```sql
ALTER TABLE comments RENAME COLUMN severity TO type;
```

Default value remains `'suggestion'`. No data migration needed — existing values are all valid `CommentType` values. The schema definition updates from `severity: text('severity')` to `type: text('type')`.

### 3. Review Prompt Builder — `question` Handling

Add a new section to the type-handling instructions in the review prompt builder, ordered first (lowest urgency):

**`question`** — Answer the question. If the question reveals an actual issue, fix it. If not, just reply with the answer — no code changes needed.

The existing sections for `must-fix`, `request`, and `suggestion` remain unchanged in behavior. All references to "severity" in the prompt text rename to "type".

### 4. Insights Filtering

The insights history endpoint (`GET /api/projects/:projectId/comments/history`) reads the `insights.ignoredTypes` config key from the merged project config and excludes those comment types from the response.

- **Config key:** `insights.ignoredTypes`
- **Default:** `["question"]`
- **Stored as:** JSON-serialized string array in the config system
- **Configurable at:** Global level (via `global_config` / `~/.agent-shepherd/config.yml`) and per-project (via `project_config` / `.agent-shepherd.yml`), with per-project overriding global per the existing three-tier precedence
- **Empty array (`[]`):** All comment types included (no filtering)

The filtering happens unconditionally inside the history endpoint — no query param needed since this endpoint is only used by insights.

The fix agent's comment endpoints (`GET /api/prs/:prId/comments`) remain unfiltered. The fix agent needs to see all comments including questions since it should answer them.

### 5. Frontend

**Color mapping** — Add `question` with a purple/violet color via a new CSS custom property `--color-question`:

```typescript
const typeColors: Record<string, string> = {
  question: 'var(--color-question)',
  suggestion: 'var(--color-accent)',
  request: 'var(--color-warning)',
  'must-fix': 'var(--color-danger)',
};
```

**Comment form** — The selector renames from severity to type. `question` appears first:

```
Question | Suggestion | Request | Must Fix
```

**Badge text** — Renders `comment.type` (previously `comment.severity`). Display values read naturally as-is.

### 6. CLI & API Rename

- CLI `review comments`: `--severity` flag becomes `--type`
- CLI `review.ts`: local `Comment` interface field `severity` becomes `type`, format functions update variable names accordingly
- API routes (`comments.ts`): query param `severity` becomes `type`, `buildCommentSummary` output keys rename `bySeverity` to `byType`
- API request/response bodies: `severity` field becomes `type` in comment creation and batch payloads

### 7. Tests

Existing tests update to reflect the rename and new value:

- Shared types test: `CommentType` with 4 values
- Comment route tests: All `severity` references become `type`, add a test case for `question` comments
- Comment summary tests: Verify `byType` key name
- Prompt builder tests: Update severity references to type
- Frontend component tests: Update accordingly
- Coverage remains at 80%+
