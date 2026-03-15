# Insight New/Updated Badges Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show "New" and "Updated" badges on insight items so users can see what changed between analyzer runs.

**Architecture:** Backend-side diffing on the PUT endpoint compares incoming items against existing ones by title (per-category). Per-item `firstSeenAt`/`lastUpdatedAt` timestamps are computed server-side and stored in the categories JSON blob. A `previousUpdatedAt` column on the insights record lets the frontend determine badge state.

**Tech Stack:** TypeScript, Drizzle ORM (SQLite), Fastify, React 19, Vitest

**Spec:** `docs/plans/2026-03-15-insight-new-badges-design.md`

---

## File Structure

| Action | Path                                                                 | Responsibility                                                                               |
| ------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Modify | `packages/shared/src/types.ts`                                       | Add `firstSeenAt`, `lastUpdatedAt` to item interfaces; add `previousUpdatedAt` to `Insights` |
| Modify | `packages/backend/src/db/schema.ts`                                  | Add `previousUpdatedAt` column to insights table                                             |
| Create | `packages/backend/drizzle/0008_add_insights_previous_updated_at.sql` | Migration SQL                                                                                |
| Create | `packages/backend/src/routes/insight-differ.ts`                      | Pure function: diff incoming categories against existing, compute timestamps                 |
| Create | `packages/backend/src/routes/__tests__/insight-differ.test.ts`       | Unit tests for diffing logic                                                                 |
| Modify | `packages/backend/src/routes/insights.ts`                            | Use differ in PUT handler; remove local type declarations, import from shared                |
| Modify | `packages/backend/src/routes/__tests__/insights.test.ts`             | Integration tests for timestamp behavior through API                                         |
| Modify | `packages/frontend/src/api.ts`                                       | Add `previousUpdatedAt` to `InsightsResponse`                                                |
| Modify | `packages/frontend/src/components/insights-tab.tsx`                  | Import types from shared; add badge rendering; update props                                  |
| Modify | `packages/frontend/src/pages/pr-review.tsx`                          | Pass `previousUpdatedAt` through to InsightsTab                                              |
| Modify | `skills/agent-shepherd-workflow-analyzer/SKILL.md`                   | Add title-preservation guidance                                                              |

---

## Task 1: Shared Types

**Files:**

- Modify: `packages/shared/src/types.ts:132-171`

- [ ] **Step 1: Add timestamp fields to all three item interfaces and Insights**

In `packages/shared/src/types.ts`, update:

```typescript
export interface InsightItem {
  title: string;
  description: string;
  confidence: InsightConfidence;
  appliedPath?: string;
  firstSeenAt: string;
  lastUpdatedAt?: string;
}

export interface RecurringPatternItem {
  title: string;
  description: string;
  confidence: InsightConfidence;
  prIds: string[];
  firstSeenAt: string;
  lastUpdatedAt?: string;
}

export interface ToolRecommendationItem {
  title: string;
  description: string;
  confidence: InsightConfidence;
  implementationPrompt: string;
  firstSeenAt: string;
  lastUpdatedAt?: string;
}
```

And add `previousUpdatedAt` to `Insights`:

```typescript
export interface Insights {
  id: string;
  prId: string;
  categories: InsightCategories;
  branchRef: string | null;
  worktreePath: string | null;
  updatedAt: string;
  previousUpdatedAt: string | null;
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build --workspace=packages/shared`
Expected: PASS (shared has no consumers checked at this point)

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "feat: add firstSeenAt/lastUpdatedAt to insight item types and previousUpdatedAt to Insights"
```

---

## Task 2: Database Schema + Migration

**Files:**

- Modify: `packages/backend/src/db/schema.ts:98-109`
- Create: migration via `npx drizzle-kit generate`

- [ ] **Step 1: Add `previousUpdatedAt` column to insights schema**

In `packages/backend/src/db/schema.ts`, update the `insights` table:

```typescript
export const insights = sqliteTable('insights', {
  id: text('id').primaryKey(),
  prId: text('pr_id')
    .notNull()
    .references(() => pullRequests.id),
  categories: text('categories').notNull().default('{}'),
  branchRef: text('branch_ref'),
  worktreePath: text('worktree_path'),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now') || 'Z')`),
  previousUpdatedAt: text('previous_updated_at'),
});
```

- [ ] **Step 2: Generate migration**

Run: `npx drizzle-kit generate --name add_insights_previous_updated_at`
Expected: Creates a new SQL migration file in `packages/backend/drizzle/`

- [ ] **Step 3: Verify the generated migration SQL**

Read the generated file. It should contain:

```sql
ALTER TABLE `insights` ADD `previous_updated_at` text;
```

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/db/schema.ts packages/backend/drizzle/
git commit -m "feat: add previous_updated_at column to insights table"
```

---

## Task 3: Insight Differ (Core Logic + Tests)

**Files:**

- Create: `packages/backend/src/routes/insight-differ.ts`
- Create: `packages/backend/src/routes/__tests__/insight-differ.test.ts`

- [ ] **Step 1: Write failing tests for the differ**

Create `packages/backend/src/routes/__tests__/insight-differ.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  InsightCategories,
  InsightItem,
  RecurringPatternItem,
  ToolRecommendationItem,
} from '@agent-shepherd/shared';
import { diffInsightCategories } from '../insight-differ.js';

describe('diffInsightCategories', () => {
  const NOW = '2026-03-15T12:00:00.000Z';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const emptyCategories: InsightCategories = {
    toolRecommendations: [],
    claudeMdRecommendations: [],
    skillRecommendations: [],
    promptEngineering: [],
    agentBehaviorObservations: [],
    recurringPatterns: [],
  };

  it('stamps firstSeenAt on all items when no existing categories', () => {
    const incoming: InsightCategories = {
      ...emptyCategories,
      claudeMdRecommendations: [
        {
          title: 'Add lint rule',
          description: 'Enable no-unused-vars',
          confidence: 'high',
          firstSeenAt: '',
        },
      ],
    };

    const result = diffInsightCategories(incoming, undefined);
    expect(result.claudeMdRecommendations[0].firstSeenAt).toBe(NOW);
    expect(result.claudeMdRecommendations[0].lastUpdatedAt).toBeUndefined();
  });

  it('preserves firstSeenAt for unchanged items', () => {
    const existingTime = '2026-03-14T10:00:00.000Z';
    const existing: InsightCategories = {
      ...emptyCategories,
      claudeMdRecommendations: [
        {
          title: 'Add lint rule',
          description: 'Enable no-unused-vars',
          confidence: 'high',
          firstSeenAt: existingTime,
        },
      ],
    };
    const incoming: InsightCategories = {
      ...emptyCategories,
      claudeMdRecommendations: [
        {
          title: 'Add lint rule',
          description: 'Enable no-unused-vars',
          confidence: 'high',
          firstSeenAt: '',
        },
      ],
    };

    const result = diffInsightCategories(incoming, existing);
    expect(result.claudeMdRecommendations[0].firstSeenAt).toBe(existingTime);
    expect(result.claudeMdRecommendations[0].lastUpdatedAt).toBeUndefined();
  });

  it('sets lastUpdatedAt when content changes', () => {
    const existingTime = '2026-03-14T10:00:00.000Z';
    const existing: InsightCategories = {
      ...emptyCategories,
      claudeMdRecommendations: [
        {
          title: 'Add lint rule',
          description: 'Enable no-unused-vars',
          confidence: 'high',
          firstSeenAt: existingTime,
        },
      ],
    };
    const incoming: InsightCategories = {
      ...emptyCategories,
      claudeMdRecommendations: [
        {
          title: 'Add lint rule',
          description: 'Updated description',
          confidence: 'medium',
          firstSeenAt: '',
        },
      ],
    };

    const result = diffInsightCategories(incoming, existing);
    expect(result.claudeMdRecommendations[0].firstSeenAt).toBe(existingTime);
    expect(result.claudeMdRecommendations[0].lastUpdatedAt).toBe(NOW);
  });

  it('preserves existing lastUpdatedAt when content unchanged after previous update', () => {
    const firstSeen = '2026-03-13T10:00:00.000Z';
    const lastUpdated = '2026-03-14T10:00:00.000Z';
    const existing: InsightCategories = {
      ...emptyCategories,
      claudeMdRecommendations: [
        {
          title: 'Add lint rule',
          description: 'Updated desc',
          confidence: 'medium',
          firstSeenAt: firstSeen,
          lastUpdatedAt: lastUpdated,
        },
      ],
    };
    const incoming: InsightCategories = {
      ...emptyCategories,
      claudeMdRecommendations: [
        {
          title: 'Add lint rule',
          description: 'Updated desc',
          confidence: 'medium',
          firstSeenAt: '',
        },
      ],
    };

    const result = diffInsightCategories(incoming, existing);
    expect(result.claudeMdRecommendations[0].firstSeenAt).toBe(firstSeen);
    expect(result.claudeMdRecommendations[0].lastUpdatedAt).toBe(lastUpdated);
  });

  it('strips agent-provided firstSeenAt and lastUpdatedAt', () => {
    const incoming: InsightCategories = {
      ...emptyCategories,
      claudeMdRecommendations: [
        {
          title: 'New item',
          description: 'Desc',
          confidence: 'high',
          firstSeenAt: '2020-01-01T00:00:00.000Z',
          lastUpdatedAt: '2020-01-01T00:00:00.000Z',
        },
      ],
    };

    const result = diffInsightCategories(incoming, undefined);
    expect(result.claudeMdRecommendations[0].firstSeenAt).toBe(NOW);
    expect(result.claudeMdRecommendations[0].lastUpdatedAt).toBeUndefined();
  });

  it('matches titles per-category independently', () => {
    const existingTime = '2026-03-14T10:00:00.000Z';
    const existing: InsightCategories = {
      ...emptyCategories,
      claudeMdRecommendations: [
        {
          title: 'Use structured logging',
          description: 'Desc A',
          confidence: 'high',
          firstSeenAt: existingTime,
        },
      ],
      skillRecommendations: [],
    };
    const incoming: InsightCategories = {
      ...emptyCategories,
      claudeMdRecommendations: [
        {
          title: 'Use structured logging',
          description: 'Desc A',
          confidence: 'high',
          firstSeenAt: '',
        },
      ],
      skillRecommendations: [
        {
          title: 'Use structured logging',
          description: 'Desc B',
          confidence: 'medium',
          firstSeenAt: '',
        },
      ],
    };

    const result = diffInsightCategories(incoming, existing);
    expect(result.claudeMdRecommendations[0].firstSeenAt).toBe(existingTime);
    expect(result.skillRecommendations[0].firstSeenAt).toBe(NOW);
  });

  it('handles duplicate titles within a category — only first matches', () => {
    const existingTime = '2026-03-14T10:00:00.000Z';
    const existing: InsightCategories = {
      ...emptyCategories,
      claudeMdRecommendations: [
        {
          title: 'Same title',
          description: 'Original',
          confidence: 'high',
          firstSeenAt: existingTime,
        },
      ],
    };
    const incoming: InsightCategories = {
      ...emptyCategories,
      claudeMdRecommendations: [
        {
          title: 'Same title',
          description: 'Original',
          confidence: 'high',
          firstSeenAt: '',
        },
        {
          title: 'Same title',
          description: 'Duplicate',
          confidence: 'low',
          firstSeenAt: '',
        },
      ],
    };

    const result = diffInsightCategories(incoming, existing);
    expect(result.claudeMdRecommendations[0].firstSeenAt).toBe(existingTime);
    expect(result.claudeMdRecommendations[1].firstSeenAt).toBe(NOW);
  });

  it('compares prIds order-insensitively for RecurringPatternItem', () => {
    const existingTime = '2026-03-14T10:00:00.000Z';
    const existing: InsightCategories = {
      ...emptyCategories,
      recurringPatterns: [
        {
          title: 'Pattern A',
          description: 'Desc',
          confidence: 'high',
          prIds: ['pr-1', 'pr-2'],
          firstSeenAt: existingTime,
        },
      ],
    };
    const incoming: InsightCategories = {
      ...emptyCategories,
      recurringPatterns: [
        {
          title: 'Pattern A',
          description: 'Desc',
          confidence: 'high',
          prIds: ['pr-2', 'pr-1'],
          firstSeenAt: '',
        },
      ],
    };

    const result = diffInsightCategories(incoming, existing);
    expect(result.recurringPatterns[0].firstSeenAt).toBe(existingTime);
    expect(result.recurringPatterns[0].lastUpdatedAt).toBeUndefined();
  });

  it('detects prIds change when new PR added', () => {
    const existingTime = '2026-03-14T10:00:00.000Z';
    const existing: InsightCategories = {
      ...emptyCategories,
      recurringPatterns: [
        {
          title: 'Pattern A',
          description: 'Desc',
          confidence: 'high',
          prIds: ['pr-1'],
          firstSeenAt: existingTime,
        },
      ],
    };
    const incoming: InsightCategories = {
      ...emptyCategories,
      recurringPatterns: [
        {
          title: 'Pattern A',
          description: 'Desc',
          confidence: 'high',
          prIds: ['pr-1', 'pr-2'],
          firstSeenAt: '',
        },
      ],
    };

    const result = diffInsightCategories(incoming, existing);
    expect(result.recurringPatterns[0].firstSeenAt).toBe(existingTime);
    expect(result.recurringPatterns[0].lastUpdatedAt).toBe(NOW);
  });

  it('compares implementationPrompt for ToolRecommendationItem', () => {
    const existingTime = '2026-03-14T10:00:00.000Z';
    const existing: InsightCategories = {
      ...emptyCategories,
      toolRecommendations: [
        {
          title: 'Add eslint plugin',
          description: 'Desc',
          confidence: 'high',
          implementationPrompt: 'npm install eslint-plugin-x',
          firstSeenAt: existingTime,
        },
      ],
    };
    const incoming: InsightCategories = {
      ...emptyCategories,
      toolRecommendations: [
        {
          title: 'Add eslint plugin',
          description: 'Desc',
          confidence: 'high',
          implementationPrompt: 'npm install eslint-plugin-x && npm run lint',
          firstSeenAt: '',
        },
      ],
    };

    const result = diffInsightCategories(incoming, existing);
    expect(result.toolRecommendations[0].firstSeenAt).toBe(existingTime);
    expect(result.toolRecommendations[0].lastUpdatedAt).toBe(NOW);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=packages/backend -- --run src/routes/__tests__/insight-differ.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the differ**

Create `packages/backend/src/routes/insight-differ.ts`:

```typescript
import type {
  InsightCategories,
  InsightItem,
  RecurringPatternItem,
  ToolRecommendationItem,
} from '@agent-shepherd/shared';

type AnyInsightItem =
  | InsightItem
  | RecurringPatternItem
  | ToolRecommendationItem;

function arraysEqualUnordered(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sorted1 = [...a].sort();
  const sorted2 = [...b].sort();
  return sorted1.every((value, index) => value === sorted2[index]);
}

function itemContentChanged(
  incoming: AnyInsightItem,
  existing: AnyInsightItem,
): boolean {
  if (incoming.description !== existing.description) return true;
  if (incoming.confidence !== existing.confidence) return true;

  if ('appliedPath' in incoming || 'appliedPath' in existing) {
    const incomingPath = (incoming as InsightItem).appliedPath;
    const existingPath = (existing as InsightItem).appliedPath;
    if (incomingPath !== existingPath) return true;
  }

  if ('prIds' in incoming && 'prIds' in existing) {
    const incomingIds = (incoming as RecurringPatternItem).prIds;
    const existingIds = (existing as RecurringPatternItem).prIds;
    if (!arraysEqualUnordered(incomingIds, existingIds)) return true;
  }

  if (
    'implementationPrompt' in incoming &&
    'implementationPrompt' in existing
  ) {
    const incomingPrompt = (incoming as ToolRecommendationItem)
      .implementationPrompt;
    const existingPrompt = (existing as ToolRecommendationItem)
      .implementationPrompt;
    if (incomingPrompt !== existingPrompt) return true;
  }

  return false;
}

function diffItems<T extends AnyInsightItem>(
  incoming: T[],
  existing: T[],
  now: string,
): T[] {
  const matchedTitles = new Set<string>();

  return incoming.map((item) => {
    const {
      firstSeenAt: _f,
      lastUpdatedAt: _l,
      ...rest
    } = item as T & {
      firstSeenAt: string;
      lastUpdatedAt?: string;
    };
    const stripped = rest as unknown as T;

    const existingItem = existing.find(
      (e) =>
        e.title === item.title &&
        !matchedTitles.has(e.title + '::' + existing.indexOf(e)),
    );

    if (!existingItem) {
      matchedTitles.add(item.title + '::new-' + matchedTitles.size);
      return { ...stripped, firstSeenAt: now } as T;
    }

    const existingIndex = existing.indexOf(existingItem);
    matchedTitles.add(item.title + '::' + existingIndex);

    if (itemContentChanged(stripped, existingItem)) {
      return {
        ...stripped,
        firstSeenAt: existingItem.firstSeenAt,
        lastUpdatedAt: now,
      } as T;
    }

    return {
      ...stripped,
      firstSeenAt: existingItem.firstSeenAt,
      ...(existingItem.lastUpdatedAt
        ? { lastUpdatedAt: existingItem.lastUpdatedAt }
        : {}),
    } as T;
  });
}

export function diffInsightCategories(
  incoming: InsightCategories,
  existing: InsightCategories | undefined,
): InsightCategories {
  const now = new Date().toISOString();
  const empty: InsightCategories = {
    toolRecommendations: [],
    claudeMdRecommendations: [],
    skillRecommendations: [],
    promptEngineering: [],
    agentBehaviorObservations: [],
    recurringPatterns: [],
  };
  const prev = existing ?? empty;

  return {
    toolRecommendations: diffItems(
      incoming.toolRecommendations,
      prev.toolRecommendations,
      now,
    ),
    claudeMdRecommendations: diffItems(
      incoming.claudeMdRecommendations,
      prev.claudeMdRecommendations,
      now,
    ),
    skillRecommendations: diffItems(
      incoming.skillRecommendations,
      prev.skillRecommendations,
      now,
    ),
    promptEngineering: diffItems(
      incoming.promptEngineering,
      prev.promptEngineering,
      now,
    ),
    agentBehaviorObservations: diffItems(
      incoming.agentBehaviorObservations,
      prev.agentBehaviorObservations,
      now,
    ),
    recurringPatterns: diffItems(
      incoming.recurringPatterns,
      prev.recurringPatterns,
      now,
    ),
  };
}
```

Note: The duplicate-title matching uses a `matchedTitles` set with index tracking so only the first incoming item with a given title matches the existing item; subsequent duplicates are treated as new.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=packages/backend -- --run src/routes/__tests__/insight-differ.test.ts`
Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/insight-differ.ts packages/backend/src/routes/__tests__/insight-differ.test.ts
git commit -m "feat: add insight differ for computing per-item timestamps"
```

---

## Task 4: Integrate Differ into PUT Endpoint

**Files:**

- Modify: `packages/backend/src/routes/insights.ts:1-128`
- Modify: `packages/backend/src/routes/__tests__/insights.test.ts`

- [ ] **Step 1: Write integration tests for timestamp behavior**

Add to `packages/backend/src/routes/__tests__/insights.test.ts`:

```typescript
it('PUT stamps firstSeenAt on items during first create', async () => {
  const categories = {
    toolRecommendations: [],
    claudeMdRecommendations: [
      { title: 'Rule A', description: 'Desc', confidence: 'high' },
    ],
    skillRecommendations: [],
    promptEngineering: [],
    agentBehaviorObservations: [],
    recurringPatterns: [],
  };

  const response = await inject({
    method: 'PUT',
    url: `/api/prs/${prId}/insights`,
    payload: { categories },
  });
  const body = jsonBody(response);
  const items = (body.categories as Record<string, Record<string, unknown>[]>)
    .claudeMdRecommendations;
  expect(items[0].firstSeenAt).toBeDefined();
  expect(items[0].lastUpdatedAt).toBeUndefined();
  expect(body.previousUpdatedAt).toBeNull();
});

it('PUT rotates previousUpdatedAt on second call', async () => {
  const categories = {
    toolRecommendations: [],
    claudeMdRecommendations: [
      { title: 'Rule A', description: 'Desc', confidence: 'high' },
    ],
    skillRecommendations: [],
    promptEngineering: [],
    agentBehaviorObservations: [],
    recurringPatterns: [],
  };

  const first = await inject({
    method: 'PUT',
    url: `/api/prs/${prId}/insights`,
    payload: { categories },
  });
  const firstUpdatedAt = (jsonBody(first) as Record<string, unknown>)
    .updatedAt as string;

  const second = await inject({
    method: 'PUT',
    url: `/api/prs/${prId}/insights`,
    payload: { categories },
  });
  const secondBody = jsonBody(second);
  expect(secondBody.previousUpdatedAt).toBe(firstUpdatedAt);
});

it('PUT preserves firstSeenAt for unchanged items across updates', async () => {
  const categories = {
    toolRecommendations: [],
    claudeMdRecommendations: [
      { title: 'Rule A', description: 'Desc', confidence: 'high' },
    ],
    skillRecommendations: [],
    promptEngineering: [],
    agentBehaviorObservations: [],
    recurringPatterns: [],
  };

  const first = await inject({
    method: 'PUT',
    url: `/api/prs/${prId}/insights`,
    payload: { categories },
  });
  const firstItems = (
    jsonBody(first).categories as Record<string, Record<string, unknown>[]>
  ).claudeMdRecommendations;
  const originalFirstSeenAt = firstItems[0].firstSeenAt;

  const second = await inject({
    method: 'PUT',
    url: `/api/prs/${prId}/insights`,
    payload: { categories },
  });
  const secondItems = (
    jsonBody(second).categories as Record<string, Record<string, unknown>[]>
  ).claudeMdRecommendations;
  expect(secondItems[0].firstSeenAt).toBe(originalFirstSeenAt);
});

it('PUT sets lastUpdatedAt when item content changes', async () => {
  const categories1 = {
    toolRecommendations: [],
    claudeMdRecommendations: [
      { title: 'Rule A', description: 'Desc', confidence: 'high' },
    ],
    skillRecommendations: [],
    promptEngineering: [],
    agentBehaviorObservations: [],
    recurringPatterns: [],
  };

  await inject({
    method: 'PUT',
    url: `/api/prs/${prId}/insights`,
    payload: { categories: categories1 },
  });

  const categories2 = {
    ...categories1,
    claudeMdRecommendations: [
      { title: 'Rule A', description: 'Changed desc', confidence: 'medium' },
    ],
  };

  const second = await inject({
    method: 'PUT',
    url: `/api/prs/${prId}/insights`,
    payload: { categories: categories2 },
  });
  const items = (
    jsonBody(second).categories as Record<string, Record<string, unknown>[]>
  ).claudeMdRecommendations;
  expect(items[0].lastUpdatedAt).toBeDefined();
});

it('GET returns previousUpdatedAt from the record', async () => {
  const categories = {
    toolRecommendations: [],
    claudeMdRecommendations: [],
    skillRecommendations: [],
    promptEngineering: [],
    agentBehaviorObservations: [],
    recurringPatterns: [],
  };

  await inject({
    method: 'PUT',
    url: `/api/prs/${prId}/insights`,
    payload: { categories },
  });
  await inject({
    method: 'PUT',
    url: `/api/prs/${prId}/insights`,
    payload: { categories },
  });

  const response = await inject({
    method: 'GET',
    url: `/api/prs/${prId}/insights`,
  });
  const body = jsonBody(response);
  expect(body.previousUpdatedAt).toBeDefined();
  expect(body.previousUpdatedAt).not.toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=packages/backend -- --run src/routes/__tests__/insights.test.ts`
Expected: FAIL — `firstSeenAt` undefined, `previousUpdatedAt` not in response

- [ ] **Step 3: Update the PUT endpoint to use the differ**

In `packages/backend/src/routes/insights.ts`:

1. Remove the local `InsightItem` and `InsightCategories` interface declarations (lines 6-21).
2. Add import for the differ and shared types:

```typescript
import type { InsightCategories } from '@agent-shepherd/shared';
import { diffInsightCategories } from './insight-differ.js';
```

3. Replace the `migrateInsightCategories` local `InsightItem` with a looser type that supports the migration (since it handles legacy `applied` field):

```typescript
interface LegacyInsightItem {
  applied?: boolean;
  confidence?: string;
  appliedPath?: string;
  [key: string]: unknown;
}

interface LegacyInsightCategories {
  [key: string]: LegacyInsightItem[] | undefined;
}
```

4. Update the PUT handler to:
   - Parse existing categories if record exists
   - Call `diffInsightCategories(incomingCategories, existingCategories)`
   - Set `previousUpdatedAt` to existing `updatedAt` (or null for first run)
   - Serialize the diffed categories

The updated PUT handler body:

```typescript
fastify.put('/api/prs/:prId/insights', (request) => {
  const { prId } = request.params as { prId: string };
  const { categories, branchRef, worktreePath } = request.body as {
    categories: InsightCategories;
    branchRef?: string;
    worktreePath?: string;
  };

  const existing = database
    .select()
    .from(schema.insights)
    .where(eq(schema.insights.prId, prId))
    .get();

  const existingCategories = existing
    ? (migrateInsightCategories(
        JSON.parse(existing.categories) as LegacyInsightCategories,
      ) as unknown as InsightCategories)
    : undefined;

  const diffedCategories = diffInsightCategories(
    categories,
    existingCategories,
  );
  const categoriesJson = JSON.stringify(diffedCategories);
  const now = new Date().toISOString();

  if (existing) {
    database
      .update(schema.insights)
      .set({
        categories: categoriesJson,
        ...(branchRef === undefined ? {} : { branchRef }),
        ...(worktreePath === undefined ? {} : { worktreePath }),
        previousUpdatedAt: existing.updatedAt,
        updatedAt: now,
      })
      .where(eq(schema.insights.id, existing.id))
      .run();
  } else {
    const id = randomUUID();
    database
      .insert(schema.insights)
      .values({
        id,
        prId,
        categories: categoriesJson,
        branchRef,
        worktreePath,
        previousUpdatedAt: null,
        updatedAt: now,
      })
      .run();
  }

  const row = database
    .select()
    .from(schema.insights)
    .where(eq(schema.insights.prId, prId))
    .get();

  if (!row) {
    return;
  }

  return {
    ...row,
    categories: migrateInsightCategories(
      JSON.parse(row.categories) as LegacyInsightCategories,
    ),
  };
});
```

- [ ] **Step 4: Update existing integration tests for timestamp fields**

Existing tests use `toEqual` to compare response categories against request payloads. After the differ is integrated, response items include `firstSeenAt` which wasn't in the request. Update the three affected assertions:

1. In the "creates insights on first call" test (line ~66), change:

   ```typescript
   expect(body.categories).toEqual(categories);
   ```

   to:

   ```typescript
   expect(body.categories).toMatchObject(categories);
   ```

2. In the "updates existing insights" test (line ~113), change:

   ```typescript
   expect(secondBody.categories).toEqual(categories2);
   ```

   to:

   ```typescript
   expect(secondBody.categories).toMatchObject(categories2);
   ```

3. In the "returns insights after creation" test (line ~399), change:
   ```typescript
   expect(body.categories).toEqual(categories);
   ```
   to:
   ```typescript
   expect(body.categories).toMatchObject(categories);
   ```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test --workspace=packages/backend -- --run src/routes/__tests__/insights.test.ts`
Expected: PASS — all tests green (both old and new)

- [ ] **Step 6: Verify build passes**

Run: `npm run build --workspace=packages/backend`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/routes/insights.ts packages/backend/src/routes/__tests__/insights.test.ts
git commit -m "feat: integrate insight differ into PUT endpoint with previousUpdatedAt rotation"
```

---

## Task 5: Frontend — Badges + Type Consolidation

**Files:**

- Modify: `packages/frontend/src/api.ts:54-58`
- Modify: `packages/frontend/src/components/insights-tab.tsx`
- Modify: `packages/frontend/src/pages/pr-review.tsx:85-87, 877-885`

- [ ] **Step 1: Update `InsightsResponse` in api.ts**

In `packages/frontend/src/api.ts`, update the `InsightsResponse` interface:

```typescript
interface InsightsResponse {
  categories: Record<string, unknown>;
  branchRef: string | undefined;
  updatedAt: string;
  previousUpdatedAt: string | null;
}
```

- [ ] **Step 2: Update insights-tab.tsx — import types from shared and add badges**

In `packages/frontend/src/components/insights-tab.tsx`:

1. Remove local type declarations (lines 5-35: `InsightConfidence`, `InsightItem`, `RecurringPatternItem`, `ToolRecommendationItem`, `InsightCategories`).

2. Add import from shared:

```typescript
import type {
  InsightConfidence,
  InsightItem,
  InsightCategories,
  RecurringPatternItem,
  ToolRecommendationItem,
} from '@agent-shepherd/shared';
```

3. Update `InsightsTabProperties` to include `previousUpdatedAt`:

```typescript
interface InsightsTabProperties {
  insights:
    | {
        categories: InsightCategories;
        branchRef: string | undefined;
        updatedAt: string;
        previousUpdatedAt: string | null;
      }
    | undefined;
  hasComments: boolean;
  analyzerRunning: boolean;
  analyzerActivity: ActivityEntry[];
  onCancelAnalyzer: () => void;
}
```

4. Add a badge helper function after the `confidenceColors` const:

```typescript
type BadgeStatus = 'new' | 'updated' | undefined;

function getItemBadgeStatus(
  item: { firstSeenAt: string; lastUpdatedAt?: string },
  previousUpdatedAt: string | null | undefined,
): BadgeStatus {
  if (!previousUpdatedAt) return 'new';
  if (item.firstSeenAt > previousUpdatedAt) return 'new';
  if (item.lastUpdatedAt && item.lastUpdatedAt > previousUpdatedAt)
    return 'updated';
  return undefined;
}

const badgeStyles: Record<
  'new' | 'updated',
  { bg: string; text: string; label: string }
> = {
  new: {
    bg: 'rgba(56,139,253,0.15)',
    text: 'var(--color-accent, #58a6ff)',
    label: 'New',
  },
  updated: {
    bg: 'rgba(163,113,247,0.15)',
    text: 'var(--color-purple, #a371f7)',
    label: 'Updated',
  },
};

function ItemBadge({ status }: Readonly<{ status: BadgeStatus }>) {
  if (!status) return undefined;
  const style = badgeStyles[status];
  return (
    <span
      className="text-xs px-1.5 py-0.5 rounded"
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {style.label}
    </span>
  );
}
```

5. Update `InsightCard` to accept and render the badge:

```typescript
function InsightCard({
  item,
  badgeStatus,
}: Readonly<{ item: InsightItem; badgeStatus?: BadgeStatus }>) {
  const config = confidenceColors[item.confidence];
  return (
    <div
      className="p-3 rounded border text-sm"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-bg-secondary, rgba(130,130,130,0.05))',
      }}
    >
      <div className="font-medium flex items-center gap-2">
        {item.title}
        <span
          className="text-xs px-1.5 py-0.5 rounded"
          style={{ backgroundColor: config.bg, color: config.text }}
        >
          {config.label}
        </span>
        <ItemBadge status={badgeStatus} />
      </div>
      <div className="mt-1 opacity-80">{item.description}</div>
      {item.appliedPath && (
        <div className="mt-2 text-xs opacity-70">
          Applied to{' '}
          <code
            className="px-1 py-0.5 rounded"
            style={{ backgroundColor: 'rgba(130,130,130,0.15)' }}
          >
            {item.appliedPath}
          </code>
        </div>
      )}
    </div>
  );
}
```

6. Update `ToolRecommendationCard` similarly — add `badgeStatus` prop and render `<ItemBadge>` after the confidence badge.

7. Update all `CategorySection` render callbacks in the `InsightsTab` component to pass `badgeStatus`. For example:

```typescript
<CategorySection
  title="CLAUDE.md Recommendations"
  items={insights.categories.claudeMdRecommendations}
  renderItem={(item: InsightItem, index: number) => (
    <InsightCard
      key={index}
      item={item}
      badgeStatus={getItemBadgeStatus(item, insights.previousUpdatedAt)}
    />
  )}
/>
```

Apply the same pattern to all 6 CategorySection usages. For `toolRecommendations`, pass `badgeStatus` to `ToolRecommendationCard`. For `recurringPatterns`, compute badge and pass to the inner `InsightCard`.

- [ ] **Step 3: Update pr-review.tsx to pass previousUpdatedAt**

The `insights` state in `pr-review.tsx` is typed as `Record<string, unknown>` and passed with a type assertion. Since `previousUpdatedAt` is part of the API response and the state uses `Record<string, unknown>`, it already flows through. The type assertion on line 878 casts to the InsightsTab props type, which now includes `previousUpdatedAt`. No code changes needed in `pr-review.tsx` — the existing `Record<string, unknown>` passthrough handles it.

Verify this is the case by checking that the cast on line 878 (`as Parameters<typeof InsightsTab>[0]['insights']`) infers the updated prop type.

- [ ] **Step 4: Verify build passes**

Run: `npm run build`
Expected: PASS across all packages

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/api.ts packages/frontend/src/components/insights-tab.tsx
git commit -m "feat: add New/Updated badges to insight items in frontend"
```

---

## Task 6: Skill Update

**Files:**

- Modify: `skills/agent-shepherd-workflow-analyzer/SKILL.md`

- [ ] **Step 1: Add title-preservation guidance**

In `skills/agent-shepherd-workflow-analyzer/SKILL.md`, add the following after the "Principles" section (line 275):

```markdown
## Title Stability

When updating existing insights, preserve the original title exactly. The system uses titles to track item identity across runs — changing a title causes the item to appear as a new finding rather than an update to an existing one. If the wording of an insight needs to change, update the description rather than the title.
```

- [ ] **Step 2: Commit**

```bash
git add skills/agent-shepherd-workflow-analyzer/SKILL.md
git commit -m "docs: add title-preservation guidance to workflow analyzer skill"
```

---

## Task 7: Final Verification

- [ ] **Step 1: Run full test suite with coverage**

Run: `npm run test:coverage`
Expected: PASS with 80%+ coverage across all packages

- [ ] **Step 2: Run full build**

Run: `npm run build`
Expected: PASS with zero TypeScript errors

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 4: Run format check**

Run: `npm run format:check`
Expected: PASS
