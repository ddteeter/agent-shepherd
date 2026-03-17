# Persistent Diffs for Closed PRs

**Issue:** [#28](https://github.com/drewteeter/agent-shepherd/issues/28) — After merging into main and branch is closed, no diff visible.

## Problem

When a PR's source branch is deleted after merge, the default diff endpoint (`GET /api/prs/:id/diff` with no query params) fails because it computes the diff live via `git diff base...source`.

The system already persists full diff content in `diff_snapshots` for every review cycle. Requesting `?cycle=N` works fine — only the "current" (no-cycle) path breaks.

## Solution: Serve Latest Snapshot for Non-Open PRs

In the default handler of `packages/backend/src/routes/diff.ts` (lines 173–196), check `pr.status` before attempting the live git diff. If the PR is not `open`, skip git and delegate to `handleCycleDiff()` with the latest cycle number.

This reuses the existing snapshot-serving code path — no duplication, no new abstractions.

### Pseudocode

```typescript
if (pr.status !== 'open') {
  const latestCycle = getLatestCycle(database, id);
  if (latestCycle) {
    return handleCycleDiff(
      database,
      id,
      String(latestCycle.cycleNumber),
      reply,
    );
  }
  return reply.code(404).send({ error: 'No diff snapshots available' });
}
// ... existing git-based logic for open PRs ...
```

### What Doesn't Change

- **Schema** — no migrations needed
- **Frontend** — no changes, same response shape
- **Snapshot creation** — already working correctly
- **Cycle-specific and inter-cycle diff requests** — unchanged

## Trade-offs

- If changes are pushed to the branch after the last review cycle but before merge, those won't appear in the closed PR view. This is acceptable since Agent Shepherd doesn't manage merging yet — work done outside the tool may not be captured.
- A future enhancement could capture a "final" snapshot at merge/close time to guarantee completeness.

## Testing

- Non-open PR returns latest snapshot
- Non-open PR with no snapshots returns 404
- Open PR still uses the live git path
