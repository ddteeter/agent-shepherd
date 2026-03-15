# Constrain Recurring Pattern Alerts to Current PR Comments

**Date:** 2026-03-15
**Issue:** #26 — Historical PR Analysis Digs Too Much

## Problem

The insights analyzer agent independently spelunks through `otherPrs[].comments` looking for trends, even when the current PR has no reviewer comments — or when no current PR comment relates to the historical pattern it found. This produces noise: the agent surfaces old recurring issues that past PR insights runs already flagged.

## Root Cause

The workflow analyzer skill's category 6 (Recurring Pattern Alerts) instructions don't require a current-PR comment as the anchor. The agent is free to scan all historical comments and report any patterns it finds, regardless of relevance to the current review.

## Design

Skill-only fix — three targeted edits to `skills/agent-shepherd-workflow-analyzer/SKILL.md`:

### 1. Expand the no-comments gate to cover all categories

In Analysis Workflow step 2 (line 43), change "skip categories 1-5 comment analysis" to "skip all comment-based analysis (categories 1-6)." If `currentPr` is absent or has no comments, the agent should not read `otherPrs` data at all — there's nothing to anchor against.

### 2. Rewrite category 6 description and examples

Rewrite the Recurring Pattern Alerts category description (lines 159-167) to make the anchor requirement explicit:

- Every recurring pattern alert must start from a specific comment on the current PR
- Workflow: for each `currentPr` comment, check `otherPrs` comments for similar concerns
- If a match is found across 1+ other PRs, flag as recurring
- No independent scanning of `otherPrs` for standalone trends
- If `currentPr` has no comments, category 6 is always empty

Update the examples to demonstrate the anchored pattern (e.g., "Reviewer flagged unnecessary error handling on this PR — same concern appeared in PRs abc and def") instead of the current standalone examples.

### 3. Update Placement Priority for Recurring Pattern Alerts

Update the Placement Priority bullet for category 5/Recurring Pattern Alerts (line 177) to reinforce the anchor requirement. Change from "this is a cross-PR trend (evidence from 2+ PRs)" to include that the trend must be anchored to a comment on the current PR.

## Trade-offs

The anchor constraint reduces recall for genuine recurring patterns where the current-PR comment is worded very differently from historical ones. This is an acceptable trade-off — reducing noise is more valuable than catching every possible pattern match, and past PR insights runs already surfaced those historical issues.

## Files Changed

- `skills/agent-shepherd-workflow-analyzer/SKILL.md` — three edits as described above

## Not Changing

- No backend changes (API, routes, prompt builder)
- No shared types changes
- No frontend changes
