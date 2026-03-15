# Insights Agent Cross-PR Hallucination Fix

**Issue:** [#4](https://github.com/ddteeter/agent-shepherd/issues/4)

## Problem

The insights agent receives a flat array of comments from all PRs in a project via `agent-shepherd insights history <project-id>`. Each comment includes a `prId` field, but the agent must manually filter to determine which comments belong to the current PR. In practice, the agent conflates comments from unrelated PRs with the current one — reporting reviewer feedback that was never made on the PR under analysis.

## Root Cause

The `/api/projects/:projectId/comments/history` endpoint returns an unstructured flat array. The workflow-analyzer skill tells the agent to "look for recurring themes" but doesn't enforce a boundary between per-PR analysis and cross-PR pattern detection. The LLM blends the context.

## Solution: Restructure the API Response

Group comments by current PR vs. other PRs so the data format itself prevents conflation.

### API Changes

The `/api/projects/:projectId/comments/history` endpoint accepts an optional `?currentPrId=<id>` query parameter and returns:

```json
{
  "currentPr": {
    "prId": "abc-123",
    "prTitle": "feat/resubmit",
    "comments": [...]
  },
  "otherPrs": [
    {
      "prId": "def-456",
      "prTitle": "feat/initial-implementation",
      "comments": [...]
    }
  ]
}
```

When `currentPrId` is omitted, all comments go into `otherPrs` (backward compatibility).

The backend joins against `pullRequests` to include PR titles for labeling.

### CLI Changes

The `insights history` command adds an optional `--pr <pr-id>` flag:

```
agent-shepherd insights history <project-id> --pr <current-pr-id>
```

When `--pr` is provided, it passes `?currentPrId=<id>` to the API. Output changes from a flat JSON array to the grouped structure.

### Prompt Builder Changes

Update the CLI command hint in `prompt-builder.ts` from:

```
agent-shepherd insights history ${projectId}
```

to:

```
agent-shepherd insights history ${projectId} --pr ${prId}
```

### Skill Changes

Two updates to the workflow-analyzer skill:

1. **Step 2 (Fetch comment history)** — Reference the new grouped format:
   - Use `currentPr.comments` for analyzing agent behavior on this PR (categories 1-4)
   - Use `otherPrs` only for category 5 (Recurring Pattern Alerts)

2. **Step 4 (Correlate transcripts with comments)** — Add explicit instruction: "Only correlate session transcripts with comments from `currentPr`. Never attribute comments from `otherPrs` to the current PR's agent session."

## Scope

| Component        | File                                                           | Change                                |
| ---------------- | -------------------------------------------------------------- | ------------------------------------- |
| Backend endpoint | `packages/backend/src/routes/comments.ts`                      | Restructure response, add query param |
| CLI command      | `packages/cli/src/commands/insights.ts`                        | Add `--pr` flag, update output type   |
| Prompt builder   | `packages/backend/src/orchestrator/insights/prompt-builder.ts` | Add `--pr` to command hint            |
| Skill            | `skills/agent-shepherd-workflow-analyzer/SKILL.md`             | Clarify data boundaries               |
| Tests            | `packages/backend/src/routes/__tests__/insights.test.ts`       | Update for new response shape         |
