# Worktree-Aware PRs

**Date:** 2026-02-28
**Status:** Draft

## Problem

Agent Shepherd assumes a single working directory per project (`project.path`). When multiple agents work on the same repo in parallel using git worktrees, each agent operates in a different directory (e.g., `/repo/.claude/worktrees/task-1/`). The current system has two problems:

1. **Agent re-dispatch breaks.** When a human requests changes, the orchestrator spawns the next agent session in `project.path` (the main repo checkout), not the worktree where the original agent was working. The agent lands in the wrong directory, on the wrong branch.
2. **No visibility.** The reviewer has no way to see which worktree/directory a PR originated from.

## Design

### Approach

Add a `workingDirectory` field to the `pull_requests` table. The CLI auto-captures `process.cwd()` during `shepherd submit`. The orchestrator uses this path when spawning follow-up agent sessions, falling back to `project.path` for PRs that don't have it set.

Named `workingDirectory` (not `worktreePath`) because it's general-purpose — works for worktrees, separate clones, or any directory structure.

### Changes

#### 1. Schema (`packages/backend/src/db/schema.ts`)

Add nullable `workingDirectory` column to `pull_requests` table:

```typescript
workingDirectory: text('working_directory'),
```

Generate a Drizzle migration with `--name add_working_directory`.

#### 2. Shared Types (`packages/shared/src/types.ts`)

Add `workingDirectory` to `PullRequest` interface:

```typescript
export interface PullRequest {
  // ... existing fields
  workingDirectory: string | null;
}
```

Add `workingDirectory` to `CreatePRInput`:

```typescript
export interface CreatePRInput {
  // ... existing fields
  workingDirectory?: string;
}
```

#### 3. CLI Submit Command (`packages/cli/src/commands/submit.ts`)

Auto-capture `process.cwd()` and include it in the POST body:

```typescript
const pr = await client.post(`/api/projects/${opts.project}/prs`, {
  title: opts.title || 'Agent PR',
  description: opts.description,
  sourceBranch: opts.sourceBranch || 'HEAD',
  agentContext,
  workingDirectory: process.cwd(),
});
```

No new CLI flag — always auto-detected from cwd.

#### 4. API Route — PR Creation (`packages/backend/src/routes/pull-requests.ts`)

Accept `workingDirectory` from the request body and persist it to the database when creating the PR record.

#### 5. Orchestrator (`packages/backend/src/orchestrator/index.ts`)

When spawning an agent, resolve the working directory:

```typescript
const cwd = pr.workingDirectory ?? project.path;
```

Before spawning, verify the directory exists. If it doesn't, fail with a clear error:

```
Error: Working directory does not exist: /repo/.claude/worktrees/task-1/
The worktree may have been removed. Recreate it and try again.
```

Update the cycle status to `agent_error` on failure.

#### 6. Frontend — PR Detail Page

Show the working directory as subtle metadata on the PR detail page (e.g., a small label or tooltip near the branch info). Only displayed when `workingDirectory` is set and differs from the project path.

#### 7. Submit PR Skill (`skills/agent-shepherd-submit-pr/SKILL.md`)

Update the skill documentation to mention that the working directory is now auto-captured from the agent's cwd. No action required from the agent — it just needs to run `shepherd submit` from the correct directory (which it naturally will if it's working in a worktree).

### Backward Compatibility

- Existing PRs have `workingDirectory: null`
- Orchestrator falls back to `project.path` when `workingDirectory` is null
- No breaking changes to the API — the field is optional on input
- UI only shows the metadata when the field is populated

### Not In Scope

- Worktree creation/cleanup (user manages worktree lifecycle)
- Recreating missing worktrees (fail with clear error if gone)
- PR grouping or multi-agent dashboard (future work)
- Merge coordination across concurrent agents (future work)
