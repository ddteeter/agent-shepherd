# Insights Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add confidence levels, CLAUDE.md best practices context, and cycle deduplication to the insights system.

**Architecture:** Three areas of change: (1) data model updates to shared types + frontend types with `confidence` enum and `appliedPath` replacing `applied` boolean, (2) prompt/skill updates for CLAUDE.md guidance, confidence definitions, and deduplication context, (3) frontend badge display. No DB schema migration needed since categories is a JSON blob.

**Tech Stack:** TypeScript, Fastify, React 19, Tailwind CSS 4, Vitest

---

### Task 1: Update shared types

**Files:**
- Modify: `packages/shared/src/types.ts:112-139`

**Step 1: Write the type changes**

Update `InsightItem` to replace `applied?: boolean` with `confidence` and `appliedPath`:

```typescript
export type InsightConfidence = 'high' | 'medium' | 'low';

export interface InsightItem {
  title: string;
  description: string;
  confidence: InsightConfidence;
  appliedPath?: string;
}
```

Update `RecurringPatternItem` to also include `confidence`:

```typescript
export interface RecurringPatternItem {
  title: string;
  description: string;
  confidence: InsightConfidence;
  prIds: string[];
}
```

`InsightCategories` and `Insights` interfaces remain unchanged structurally.

**Step 2: Verify the build compiles**

Run: `npm run build --workspace=packages/shared`
Expected: SUCCESS (shared types are consumed by other packages, but no runtime code changed)

**Step 3: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "feat(shared): add confidence and appliedPath to insight types"
```

---

### Task 2: Update frontend types and InsightCard component

**Files:**
- Modify: `packages/frontend/src/components/InsightsTab.tsx:5-9, 63-84`

**Step 1: Write the failing test**

Create a test file if one doesn't exist, or verify existing component behavior. Since this is a presentational component, we'll verify visually after changes. Skip to implementation.

**Step 2: Update local types in InsightsTab**

Replace the local `InsightItem` interface (lines 5-9) and `RecurringPatternItem` (lines 11-15):

```typescript
type InsightConfidence = 'high' | 'medium' | 'low';

interface InsightItem {
  title: string;
  description: string;
  confidence: InsightConfidence;
  appliedPath?: string;
}

interface RecurringPatternItem {
  title: string;
  description: string;
  confidence: InsightConfidence;
  prIds: string[];
}
```

**Step 3: Add confidence badge to InsightCard**

Replace `InsightCard` component (lines 63-84). Add a colored pill badge next to the title and replace the `applied` boolean display with `appliedPath`:

```tsx
const confidenceColors: Record<InsightConfidence, { bg: string; text: string; label: string }> = {
  high: { bg: 'rgba(46,160,67,0.15)', text: 'var(--color-success, #3fb950)', label: 'High' },
  medium: { bg: 'rgba(210,153,34,0.15)', text: 'var(--color-warning, #d29922)', label: 'Medium' },
  low: { bg: 'rgba(130,130,130,0.15)', text: 'var(--color-text)', label: 'Low' },
};

function InsightCard({ item }: { item: InsightItem }) {
  const conf = confidenceColors[item.confidence] ?? confidenceColors.medium;
  return (
    <div
      className="p-3 rounded border text-sm"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary, rgba(130,130,130,0.05))' }}
    >
      <div className="flex items-center gap-2">
        <span className="font-medium">{item.title}</span>
        <span
          className="text-xs px-1.5 py-0.5 rounded"
          style={{ backgroundColor: conf.bg, color: conf.text }}
        >
          {conf.label}
        </span>
      </div>
      <div className="mt-1 opacity-80">{item.description}</div>
      {item.appliedPath && (
        <span
          className="inline-block mt-2 text-xs px-2 py-0.5 rounded"
          style={{ backgroundColor: 'rgba(46,160,67,0.15)', color: 'var(--color-success, #3fb950)' }}
        >
          Applied to <code>{item.appliedPath}</code>
        </span>
      )}
    </div>
  );
}
```

**Step 4: Verify frontend builds**

Run: `npm run build --workspace=packages/frontend`
Expected: SUCCESS

**Step 5: Commit**

```bash
git add packages/frontend/src/components/InsightsTab.tsx
git commit -m "feat(frontend): add confidence badges and appliedPath display to insights"
```

---

### Task 3: Add data migration for existing insights

**Files:**
- Modify: `packages/backend/src/routes/insights.ts:10-27`

**Step 1: Write the failing test**

Create test at `packages/backend/src/routes/__tests__/insights-migration.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

function migrateInsightCategories(categories: Record<string, unknown[]>): Record<string, unknown[]> {
  // Migration: convert applied: true -> appliedPath: "CLAUDE.md", remove applied field
  const migrate = (items: any[]) =>
    items.map(({ applied, ...rest }) => ({
      ...rest,
      ...(applied === true ? { appliedPath: 'CLAUDE.md' } : {}),
    }));

  return {
    claudeMdRecommendations: migrate(categories.claudeMdRecommendations ?? []),
    skillRecommendations: migrate(categories.skillRecommendations ?? []),
    promptEngineering: migrate(categories.promptEngineering ?? []),
    agentBehaviorObservations: migrate(categories.agentBehaviorObservations ?? []),
    recurringPatterns: migrate(categories.recurringPatterns ?? []),
  };
}

describe('migrateInsightCategories', () => {
  it('converts applied: true to appliedPath: "CLAUDE.md"', () => {
    const input = {
      claudeMdRecommendations: [
        { title: 'Test', description: 'Desc', applied: true },
      ],
      skillRecommendations: [],
      promptEngineering: [],
      agentBehaviorObservations: [],
      recurringPatterns: [],
    };

    const result = migrateInsightCategories(input);
    expect(result.claudeMdRecommendations[0]).toEqual({
      title: 'Test',
      description: 'Desc',
      appliedPath: 'CLAUDE.md',
    });
    expect(result.claudeMdRecommendations[0]).not.toHaveProperty('applied');
  });

  it('removes applied: false without adding appliedPath', () => {
    const input = {
      claudeMdRecommendations: [
        { title: 'Test', description: 'Desc', applied: false },
      ],
      skillRecommendations: [],
      promptEngineering: [],
      agentBehaviorObservations: [],
      recurringPatterns: [],
    };

    const result = migrateInsightCategories(input);
    expect(result.claudeMdRecommendations[0]).toEqual({
      title: 'Test',
      description: 'Desc',
    });
  });

  it('passes through items without applied field unchanged', () => {
    const input = {
      claudeMdRecommendations: [
        { title: 'Test', description: 'Desc', confidence: 'high', appliedPath: '.claude/rules/test.md' },
      ],
      skillRecommendations: [],
      promptEngineering: [],
      agentBehaviorObservations: [],
      recurringPatterns: [],
    };

    const result = migrateInsightCategories(input);
    expect(result.claudeMdRecommendations[0]).toEqual({
      title: 'Test',
      description: 'Desc',
      confidence: 'high',
      appliedPath: '.claude/rules/test.md',
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/backend -- --run packages/backend/src/routes/__tests__/insights-migration.test.ts`
Expected: FAIL (function not defined — test file is self-contained so it should pass once written)

Actually, since the test includes the function inline, it will pass immediately. That's fine — this is a pure utility function we're extracting.

**Step 3: Extract migration function to `packages/backend/src/routes/insights.ts`**

Add the `migrateInsightCategories` function and apply it in the GET handler when reading from the database, so existing data is migrated on read:

In `packages/backend/src/routes/insights.ts`, add before the route registration:

```typescript
function migrateInsightCategories(categories: Record<string, unknown[]>): Record<string, unknown[]> {
  const migrate = (items: any[]) =>
    items.map(({ applied, ...rest }) => ({
      ...rest,
      ...(applied === true ? { appliedPath: 'CLAUDE.md' } : {}),
    }));

  return {
    claudeMdRecommendations: migrate(categories.claudeMdRecommendations ?? []),
    skillRecommendations: migrate(categories.skillRecommendations ?? []),
    promptEngineering: migrate(categories.promptEngineering ?? []),
    agentBehaviorObservations: migrate(categories.agentBehaviorObservations ?? []),
    recurringPatterns: migrate(categories.recurringPatterns ?? []),
  };
}
```

Apply it in the GET handler (line 25):

```typescript
return {
  ...row,
  categories: migrateInsightCategories(JSON.parse(row.categories)),
};
```

And in the PUT handler response (line 78):

```typescript
return {
  ...row,
  categories: migrateInsightCategories(JSON.parse(row.categories)),
};
```

**Step 4: Update test to import from source instead of inline**

Move the function export and update the test to import it. Or keep the test self-contained since the function is small — either approach works.

**Step 5: Run tests**

Run: `npm test --workspace=packages/backend -- --run packages/backend/src/routes/__tests__/insights-migration.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/backend/src/routes/insights.ts packages/backend/src/routes/__tests__/insights-migration.test.ts
git commit -m "feat(backend): add migration from applied boolean to appliedPath"
```

---

### Task 4: Update workflow-analyzer skill with CLAUDE.md best practices

**Files:**
- Modify: `skills/agent-shepherd-workflow-analyzer/SKILL.md:54-63, 101-131`

**Step 1: Add CLAUDE.md best practices section**

After the existing "1. CLAUDE.md Recommendations" section (around line 63), add a new subsection with curated guidance. Insert after line 63:

```markdown
#### CLAUDE.md Best Practices

<!-- Source: https://code.claude.com/docs/en/memory#claudemd-files -->
<!-- Last reviewed: 2026-03-07 -->

When recommending CLAUDE.md additions, choose the right location:

| Situation | Location | Example |
|---|---|---|
| Simple universal rule | Add directly to `CLAUDE.md` | "Use 2-space indentation" |
| Detailed topic guide | Create file + `@path/to/file` import in CLAUDE.md | API design patterns doc |
| Rule scoped to file types | `.claude/rules/name.md` with `paths` frontmatter | Rules for `src/api/**/*.ts` |

Key principles:
- Keep CLAUDE.md under 200 lines. Move details to separate files via `@imports` or `.claude/rules/`.
- Be specific and concrete — verifiable instructions, not vague guidance.
- Avoid conflicting instructions across files. Check existing CLAUDE.md and rules before adding.
- Use `paths` frontmatter in `.claude/rules/` files to scope rules to specific glob patterns.
- Think of CLAUDE.md as a "lookup matrix" — an index pointing agents to the right context for a given situation, not a dumping ground for all instructions.

Example `.claude/rules/` file with path scoping:
```yaml
---
paths:
  - "src/api/**/*.ts"
---

# API Rules
- All endpoints must validate input
- Use standard error response format
```
```

**Step 2: Add confidence level definitions**

Update the "Output Format" section (around line 101-131). Replace the JSON example and add confidence guidance:

```markdown
## Confidence Levels

Every recommendation MUST include a `confidence` field:

- **high** — Clear, repeated pattern with strong transcript evidence. The fix is well-scoped and low-risk. **Action: auto-commit file changes** for CLAUDE.md and skill recommendations.
- **medium** — Likely a real issue with a reasonable fix, but evidence is limited or the fix could have side effects. **Action: recommend only, do NOT commit file changes.**
- **low** — Possible pattern worth considering, but could be a one-off or context-dependent. **Action: recommend only, mark as speculative.**

For CLAUDE.md and skill recommendations: only commit file changes when confidence is `high`. For `medium` and `low`, describe the recommendation but leave implementation to the user.

## Output Format

Submit via CLI:
```bash
echo '<json>' | agent-shepherd insights update <pr-id> --stdin
```

JSON structure:
```json
{
  "categories": {
    "claudeMdRecommendations": [
      { "title": "Short title", "description": "Detailed explanation", "confidence": "high", "appliedPath": "CLAUDE.md" }
    ],
    "skillRecommendations": [
      { "title": "Short title", "description": "Detailed explanation", "confidence": "medium" }
    ],
    "promptEngineering": [
      { "title": "Short title", "description": "Detailed explanation", "confidence": "high" }
    ],
    "agentBehaviorObservations": [
      { "title": "Short title", "description": "Detailed explanation", "confidence": "medium" }
    ],
    "recurringPatterns": [
      { "title": "Short title", "description": "Detailed explanation", "confidence": "high", "prIds": ["pr-id-1"] }
    ]
  }
}
```

Set `appliedPath` to the file path you modified (e.g., `"CLAUDE.md"`, `".claude/rules/api-rules.md"`) when you've committed changes. Omit `appliedPath` for recommendations you haven't implemented.
```

**Step 3: Update the "applied" references in Principles section**

At line 131, update the old `applied: true` reference to use the new format.

**Step 4: Commit**

```bash
git add skills/agent-shepherd-workflow-analyzer/SKILL.md
git commit -m "feat(skill): add CLAUDE.md best practices and confidence levels to workflow-analyzer"
```

---

### Task 5: Add cycle deduplication context to prompt builder

**Files:**
- Modify: `packages/backend/src/orchestrator/insights/prompt-builder.ts:1-55`
- Test: `packages/backend/src/orchestrator/insights/__tests__/prompt-builder.test.ts`

**Step 1: Write the failing test**

Add test case to `packages/backend/src/orchestrator/insights/__tests__/prompt-builder.test.ts`:

```typescript
it('includes deduplication context when previousUpdatedAt is provided', () => {
  const prompt = buildInsightsPrompt({
    prId: 'pr-1',
    prTitle: 'Test PR',
    branch: 'feat/test',
    projectId: 'proj-1',
    transcriptPaths: ['/tmp/session.md'],
    previousUpdatedAt: '2026-03-07T10:00:00Z',
  });

  expect(prompt).toContain('2026-03-07T10:00:00Z');
  expect(prompt).toContain('git log');
  expect(prompt).toContain('already been factored');
});

it('omits deduplication context when previousUpdatedAt is not provided', () => {
  const prompt = buildInsightsPrompt({
    prId: 'pr-1',
    prTitle: 'Test PR',
    branch: 'feat/test',
    projectId: 'proj-1',
    transcriptPaths: [],
  });

  expect(prompt).not.toContain('previous analysis');
});
```

**Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/backend -- --run packages/backend/src/orchestrator/insights/__tests__/prompt-builder.test.ts`
Expected: FAIL — `previousUpdatedAt` is not in the interface yet

**Step 3: Update the prompt builder**

Add `previousUpdatedAt` to the input interface:

```typescript
interface InsightsPromptInput {
  prId: string;
  prTitle: string;
  branch: string;
  projectId: string;
  transcriptPaths: string[];
  previousUpdatedAt?: string;
}
```

Add a new section before `## Your Task` in the prompt output (before the existing "Important Notes"):

```typescript
if (input.previousUpdatedAt) {
  sections.push(`## Incremental Analysis

Your previous analysis was saved at ${input.previousUpdatedAt}. This is a follow-up run.

- Run \`git log --since="${input.previousUpdatedAt}" --oneline\` to see commits made since your last analysis. Focus on sessions that produced these new commits.
- Review your previous findings via \`insights get\`. Do not re-report existing recommendations.
- Comments from review cycles prior to ${input.previousUpdatedAt} have already been factored into your existing recommendations. Do not count them as additional evidence for a pattern. You may reference them for context when analyzing newer comments, but they should not inflate confidence or cause duplicate findings.
- If a previous finding is now better supported by additional evidence, update its confidence level or description rather than creating a duplicate.
- If no meaningful new patterns emerge, return your existing insights unchanged.
`);
}
```

**Step 4: Run test to verify it passes**

Run: `npm test --workspace=packages/backend -- --run packages/backend/src/orchestrator/insights/__tests__/prompt-builder.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/backend/src/orchestrator/insights/prompt-builder.ts packages/backend/src/orchestrator/insights/__tests__/prompt-builder.test.ts
git commit -m "feat(backend): add cycle deduplication context to insights prompt"
```

---

### Task 6: Pass previousUpdatedAt from insights analyzer

**Files:**
- Modify: `packages/backend/src/orchestrator/insights/insights-analyzer.ts`
- Test: `packages/backend/src/orchestrator/insights/__tests__/insights-analyzer.test.ts`

**Step 1: Write the failing test**

Add test case to `packages/backend/src/orchestrator/insights/__tests__/insights-analyzer.test.ts`:

```typescript
it('passes previousUpdatedAt to prompt builder when insights exist', async () => {
  // Mock db to return existing insights with updatedAt
  // Verify buildInsightsPrompt is called with previousUpdatedAt
});
```

The exact mock setup depends on the existing test structure. The key assertion: when the insights table has an existing row for this PR, `buildInsightsPrompt` receives `previousUpdatedAt` matching the row's `updatedAt`.

**Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/backend -- --run packages/backend/src/orchestrator/insights/__tests__/insights-analyzer.test.ts`
Expected: FAIL

**Step 3: Implement the change**

In `insights-analyzer.ts`, before calling `buildInsightsPrompt`, query for existing insights:

```typescript
const existingInsights = db
  .select()
  .from(schema.insights)
  .where(eq(schema.insights.prId, prId))
  .get();
```

Then pass `previousUpdatedAt` to `buildInsightsPrompt`:

```typescript
const prompt = buildInsightsPrompt({
  prId,
  prTitle: pr.title,
  branch: pr.branch,
  projectId: pr.projectId,
  transcriptPaths,
  previousUpdatedAt: existingInsights?.updatedAt,
});
```

**Step 4: Run test to verify it passes**

Run: `npm test --workspace=packages/backend -- --run packages/backend/src/orchestrator/insights/__tests__/insights-analyzer.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/backend/src/orchestrator/insights/insights-analyzer.ts packages/backend/src/orchestrator/insights/__tests__/insights-analyzer.test.ts
git commit -m "feat(backend): pass previousUpdatedAt to insights prompt builder"
```

---

### Task 7: Update prompt builder "Important Notes" for confidence thresholds

**Files:**
- Modify: `packages/backend/src/orchestrator/insights/prompt-builder.ts:49-52`

**Step 1: Update the Important Notes section**

Replace the existing line 50 (`"For CLAUDE.md and skill recommendations, only make and commit file changes if you are highly confident they are correct."`) with confidence-aware language:

```typescript
sections.push(`## Your Task

Use the \`agent-shepherd:workflow-analyzer\` skill to analyze the agent's session transcripts and comment history. The skill contains the full methodology, output categories, confidence levels, and JSON format.

### Important Notes

- Every recommendation MUST include a \`confidence\` field (\`high\`, \`medium\`, or \`low\`).
- Only make and commit file changes for CLAUDE.md and skill recommendations when confidence is \`high\`.
- When committing changes, set \`appliedPath\` to the file you modified. Choose the best location per the skill's CLAUDE.md best practices guidance.
- The \`insights update\` command replaces all existing insights for this PR. Call \`insights get\` first and include any previous findings you want to keep.
`);
```

**Step 2: Verify prompt builder tests still pass**

Run: `npm test --workspace=packages/backend -- --run packages/backend/src/orchestrator/insights/__tests__/prompt-builder.test.ts`
Expected: PASS (may need to update existing assertion strings if they match on the old text)

**Step 3: Update any test assertions that match on old prompt text**

If tests check for the exact old string "only make and commit file changes if you are highly confident", update them to check for `confidence` instead.

**Step 4: Commit**

```bash
git add packages/backend/src/orchestrator/insights/prompt-builder.ts packages/backend/src/orchestrator/insights/__tests__/prompt-builder.test.ts
git commit -m "feat(backend): update prompt notes with confidence thresholds and appliedPath"
```

---

### Task 8: Run full test suite and verify build

**Step 1: Run all backend tests**

Run: `npm test --workspace=packages/backend -- --run`
Expected: All PASS

**Step 2: Run frontend build**

Run: `npm run build --workspace=packages/frontend`
Expected: SUCCESS

**Step 3: Run full build**

Run: `npm run build`
Expected: SUCCESS

**Step 4: Fix any failures**

Address any type errors or test failures discovered.

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: address test and build issues from insights enhancements"
```
