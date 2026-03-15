# "New" / "Updated" Badges on Insight Items

**Issue:** #6
**Date:** 2026-03-15

## Problem

Insights are stored as a single JSON blob per PR, fully replaced on each analyzer run. There's one `updatedAt` timestamp on the record but no per-item history. Users have no way to tell which items are new vs. carried over from a previous run.

## Requirements

- Show a "New" badge on insight items that appeared in the latest analyzer run
- Show an "Updated" badge on items whose content changed between runs
- On the first run for a PR, all items display as "New"
- Badges are purely informational — no dismiss/acknowledge interaction
- Matching is by title within each category; all other fields (`description`, `confidence`, `appliedPath`, `prIds`, `implementationPrompt`) are compared for update detection
- Backend owns the diffing logic — not dependent on agent prompt compliance

## Approach: Backend-Side Diffing with Per-Item Timestamps

### Shared Types

Add per-item timestamps to all three insight item interfaces. Currently `RecurringPatternItem` and `ToolRecommendationItem` are independent interfaces (they do not extend `InsightItem`), so `firstSeenAt` and `lastUpdatedAt` must be added to each one individually:

```typescript
interface InsightItem {
  title: string;
  description: string;
  confidence: InsightConfidence;
  appliedPath?: string;
  firstSeenAt: string; // ISO timestamp, set when item first appears
  lastUpdatedAt?: string; // ISO timestamp, set when item content changes
}

interface RecurringPatternItem {
  title: string;
  description: string;
  confidence: InsightConfidence;
  prIds: string[];
  firstSeenAt: string;
  lastUpdatedAt?: string;
}

interface ToolRecommendationItem {
  title: string;
  description: string;
  confidence: InsightConfidence;
  implementationPrompt: string;
  firstSeenAt: string;
  lastUpdatedAt?: string;
}
```

Add `previousUpdatedAt` to the `Insights` type (using `string | null` to match the existing convention for nullable fields):

```typescript
interface Insights {
  id: string;
  prId: string;
  categories: InsightCategories;
  branchRef: string | null;
  worktreePath: string | null;
  updatedAt: string;
  previousUpdatedAt: string | null; // timestamp of the prior run
}
```

### Database Schema

Add a `previous_updated_at` text column to the `insights` table. Per-item timestamps live inside the `categories` JSON blob — no additional columns needed for those.

### PUT Endpoint Logic

When `PUT /api/prs/:prId/insights` receives new categories:

1. Load existing record (if any) from DB and deserialize its categories.
2. Copy current `updatedAt` to `previousUpdatedAt` before updating.
3. For each category independently, diff incoming items against existing items by `title`:
   - **Duplicate titles within a category:** if the agent produces multiple items with the same title in a single category, only the first is matched — subsequent duplicates are treated as new items.
   - **No match (new item):** set `firstSeenAt` to now, leave `lastUpdatedAt` undefined.
   - **Title matches existing item:**
     - Compare all content fields using deep equality (`description`, `confidence`, `appliedPath`). For `prIds` (array), use order-insensitive set comparison. For `implementationPrompt`, use string equality.
     - **Content changed:** preserve original `firstSeenAt`, set `lastUpdatedAt` to now.
     - **Content unchanged:** preserve both `firstSeenAt` and `lastUpdatedAt` from existing item.
4. First run (no existing record): all items get `firstSeenAt` set to now, `previousUpdatedAt` stays null.
5. Strip any agent-provided `firstSeenAt`/`lastUpdatedAt` values — the backend is the sole source of truth.

Title matching is scoped per-category — an item titled "Use structured logging" in `claudeMdRecommendations` is tracked independently from one with the same title in `skillRecommendations`.

### Migration Function

The existing `migrateInsightCategories` function uses `{ applied, ...rest }` destructuring with a spread. The `firstSeenAt` and `lastUpdatedAt` fields will pass through via `...rest` without interference. No changes to the migration function are needed, but this should be verified during implementation.

### Frontend Display Logic

**Type consolidation:** The frontend currently re-declares `InsightItem`, `RecurringPatternItem`, `ToolRecommendationItem`, and `InsightCategories` locally in `insights-tab.tsx` and the backend re-declares them in `insights.ts`. As part of this change, these local declarations should be replaced with imports from `@agent-shepherd/shared` to prevent type divergence.

**Badge state** determined by timestamp comparison on each insight card:

- **"New" badge:** `item.firstSeenAt > insights.previousUpdatedAt` (or `previousUpdatedAt` is null, meaning first run)
- **"Updated" badge:** `item.lastUpdatedAt && item.lastUpdatedAt > insights.previousUpdatedAt`
- **No badge:** neither condition met

**`InsightsTabProperties`** must include `previousUpdatedAt` in its insights prop so the component can compute badge state. This value flows from the DB row through the GET response (automatically included via spread) to the component props.

**Badge styling** — small pill badges next to the confidence badge:

- **New:** blue background
- **Updated:** purple background

### Skill Update

Add title-preservation guidance to the `agent-shepherd-workflow-analyzer` skill:

> When updating existing insights, preserve the original title exactly. The system uses titles to track item identity across runs — changing a title causes the item to appear as a new finding rather than an update to an existing one.

## Testing

Tests needed to maintain the 80% coverage requirement:

- **Diffing logic (unit):** new items get `firstSeenAt`, unchanged items preserve timestamps, changed items get `lastUpdatedAt`, `previousUpdatedAt` rotates correctly
- **Edge cases:** first run (no existing record), item removed between runs (no special handling — it just disappears), duplicate titles within a category, same title across different categories tracked independently
- **Array comparison:** `prIds` comparison is order-insensitive
- **Agent-provided timestamp stripping:** verify `firstSeenAt`/`lastUpdatedAt` from agent input are overwritten
- **Frontend badge logic:** verify "New", "Updated", and no-badge states render correctly based on timestamp comparison

## Components Changed

| Layer              | File                                                      | Change                                                                                                      |
| ------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Shared types       | `packages/shared/src/types.ts`                            | Add `firstSeenAt`, `lastUpdatedAt` to all three item interfaces; add `previousUpdatedAt` to `Insights`      |
| DB schema          | `packages/backend/src/db/schema.ts`                       | Add `previous_updated_at` column                                                                            |
| Migration          | `packages/backend/drizzle/`                               | New migration for column addition                                                                           |
| API route          | `packages/backend/src/routes/insights.ts`                 | Diffing logic in PUT handler; import types from shared; pass through `previousUpdatedAt` on GET             |
| Frontend component | `packages/frontend/src/components/insights-tab.tsx`       | Import types from `@agent-shepherd/shared`; add "New"/"Updated" pill badges; update `InsightsTabProperties` |
| Frontend types     | `packages/frontend/src/api.ts`                            | Add `previousUpdatedAt` to `InsightsResponse`                                                               |
| Skill              | `.agent-shepherd/skills/agent-shepherd-workflow-analyzer` | Title-preservation note                                                                                     |
