# Insights Tool Recommendations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a new highest-priority insight category for tool and guardrail recommendations, with project-aware tooling audit and agent-ready implementation prompts.

**Architecture:** New `toolRecommendations` category added to shared types, backend migration, frontend UI (with collapsible implementation prompt + copy button), and workflow analyzer skill. No DB schema changes — categories are a JSON blob.

**Tech Stack:** TypeScript, React 19, Vitest, Fastify, Tailwind CSS 4

**Design Doc:** `docs/plans/2026-03-15-insights-tool-recommendations-design.md`

---

### Task 1: Shared Types — Add `ToolRecommendationItem` and update `InsightCategories`

**Files:**

- Modify: `packages/shared/src/types.ts:128-159`

**Step 1: Add `ToolRecommendationItem` interface**

Add after `RecurringPatternItem` (line 142), before `InsightCategories`:

```typescript
export interface ToolRecommendationItem {
  title: string;
  description: string;
  confidence: InsightConfidence;
  implementationPrompt: string;
}
```

**Step 2: Add `toolRecommendations` to `InsightCategories`**

Insert as the first field in `InsightCategories`:

```typescript
export interface InsightCategories {
  toolRecommendations: ToolRecommendationItem[];
  claudeMdRecommendations: InsightItem[];
  skillRecommendations: InsightItem[];
  promptEngineering: InsightItem[];
  agentBehaviorObservations: InsightItem[];
  recurringPatterns: RecurringPatternItem[];
}
```

**Step 3: Verify build**

Run: `npm run build --workspace=packages/shared`
Expected: SUCCESS (shared has no tests, just types)

**Step 4: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "feat: add ToolRecommendationItem type and update InsightCategories (#14)"
```

---

### Task 2: Backend — Update migration function

**Files:**

- Modify: `packages/backend/src/routes/insights.ts:13-41`
- Test: `packages/backend/src/routes/__tests__/insights-migration.test.ts`

**Step 1: Write failing test for toolRecommendations default**

Add to `packages/backend/src/routes/__tests__/insights-migration.test.ts`:

```typescript
it('defaults toolRecommendations to empty array when missing', () => {
  const input = {
    claudeMdRecommendations: [],
    skillRecommendations: [],
    promptEngineering: [],
    agentBehaviorObservations: [],
    recurringPatterns: [],
  };

  const result = migrateInsightCategories(input);
  expect(result.toolRecommendations).toEqual([]);
});

it('passes through existing toolRecommendations unchanged', () => {
  const input = {
    toolRecommendations: [
      {
        title: 'Add sonarjs',
        description: 'Catches complexity',
        confidence: 'high',
        implementationPrompt: 'npm install eslint-plugin-sonarjs',
      },
    ],
    claudeMdRecommendations: [],
    skillRecommendations: [],
    promptEngineering: [],
    agentBehaviorObservations: [],
    recurringPatterns: [],
  };

  const result = migrateInsightCategories(input);
  expect(result.toolRecommendations).toEqual([
    {
      title: 'Add sonarjs',
      description: 'Catches complexity',
      confidence: 'high',
      implementationPrompt: 'npm install eslint-plugin-sonarjs',
    },
  ]);
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test --workspace=packages/backend -- --run routes/__tests__/insights-migration`
Expected: FAIL — `toolRecommendations` not in output

**Step 3: Update `InsightCategories` interface and `migrateInsightCategories`**

In `packages/backend/src/routes/insights.ts`, add `toolRecommendations` to the local `InsightCategories` interface:

```typescript
interface InsightCategories {
  toolRecommendations?: InsightItem[];
  claudeMdRecommendations?: InsightItem[];
  // ... rest unchanged
}
```

Add to the return object in `migrateInsightCategories`:

```typescript
return {
  toolRecommendations: migrate(categories.toolRecommendations ?? []),
  claudeMdRecommendations: migrate(categories.claudeMdRecommendations ?? []),
  // ... rest unchanged
};
```

**Step 4: Run test to verify it passes**

Run: `npm run test --workspace=packages/backend -- --run routes/__tests__/insights-migration`
Expected: PASS

**Step 5: Run full backend tests**

Run: `npm run test --workspace=packages/backend -- --run`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/backend/src/routes/insights.ts packages/backend/src/routes/__tests__/insights-migration.test.ts
git commit -m "feat: add toolRecommendations to insights migration (#14)"
```

---

### Task 3: Frontend — Add `ToolRecommendationCard` component and update `InsightsTab`

**Files:**

- Modify: `packages/frontend/src/components/insights-tab.tsx`
- Test: `packages/frontend/src/components/__tests__/insights-tab.test.tsx`

**Step 1: Write failing tests**

Add `ToolRecommendationItem` to the local test types in `insights-tab.test.tsx`:

```typescript
interface ToolRecommendationItem {
  title: string;
  description: string;
  confidence: 'high' | 'medium' | 'low';
  implementationPrompt: string;
}
```

Update `InsightCategories` in the test to include `toolRecommendations: ToolRecommendationItem[]`.

Update `makeInsights` to include `toolRecommendations: []` in defaults.

Add these tests:

```typescript
it('renders tool recommendations as the first category', () => {
  const insights = makeInsights({
    categories: {
      toolRecommendations: [
        {
          title: 'Add sonarjs plugin',
          description: 'Catches cognitive complexity issues',
          confidence: 'high',
          implementationPrompt: 'npm install eslint-plugin-sonarjs',
        },
      ],
    },
  });

  render(
    <InsightsTab {...defaultProps} hasComments={true} insights={insights} />,
  );
  expect(screen.getByText('Add sonarjs plugin')).toBeInTheDocument();
  expect(
    screen.getByText('Catches cognitive complexity issues'),
  ).toBeInTheDocument();
  expect(
    screen.getByText('Tool & Guardrail Recommendations'),
  ).toBeInTheDocument();
});

it('shows implementation prompt when expanded', async () => {
  const user = userEvent.setup();
  const insights = makeInsights({
    categories: {
      toolRecommendations: [
        {
          title: 'Add sonarjs',
          description: 'desc',
          confidence: 'high',
          implementationPrompt: 'npm install eslint-plugin-sonarjs',
        },
      ],
    },
  });

  render(
    <InsightsTab {...defaultProps} hasComments={true} insights={insights} />,
  );

  // Implementation prompt should be collapsed by default
  expect(
    screen.queryByText('npm install eslint-plugin-sonarjs'),
  ).not.toBeInTheDocument();

  // Expand implementation section
  await user.click(screen.getByText('Implementation'));
  expect(
    screen.getByText('npm install eslint-plugin-sonarjs'),
  ).toBeInTheDocument();
});

it('copies implementation prompt to clipboard', async () => {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });

  const insights = makeInsights({
    categories: {
      toolRecommendations: [
        {
          title: 'Add tool',
          description: 'desc',
          confidence: 'high',
          implementationPrompt: 'npm install some-tool',
        },
      ],
    },
  });

  render(
    <InsightsTab {...defaultProps} hasComments={true} insights={insights} />,
  );

  // Expand, then click copy
  await user.click(screen.getByText('Implementation'));
  await user.click(screen.getByText('Copy'));
  expect(writeText).toHaveBeenCalledWith('npm install some-tool');
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=packages/frontend -- --run components/__tests__/insights-tab`
Expected: FAIL — types don't match, component doesn't render tool recommendations

**Step 3: Update local types in `insights-tab.tsx`**

Add `ToolRecommendationItem` interface and update `InsightCategories`:

```typescript
interface ToolRecommendationItem {
  title: string;
  description: string;
  confidence: InsightConfidence;
  implementationPrompt: string;
}

interface InsightCategories {
  toolRecommendations: ToolRecommendationItem[];
  claudeMdRecommendations: InsightItem[];
  skillRecommendations: InsightItem[];
  promptEngineering: InsightItem[];
  agentBehaviorObservations: InsightItem[];
  recurringPatterns: RecurringPatternItem[];
}
```

**Step 4: Add `ToolRecommendationCard` component**

Add after the existing `InsightCard` component:

```tsx
function ToolRecommendationCard({
  item,
}: Readonly<{ item: ToolRecommendationItem }>) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const config = confidenceColors[item.confidence];

  const handleCopy = async () => {
    await navigator.clipboard.writeText(item.implementationPrompt);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

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
      </div>
      <div className="mt-1 opacity-80">{item.description}</div>
      <div className="mt-2">
        <button
          onClick={() => {
            setExpanded(!expanded);
          }}
          className="text-xs flex items-center gap-1 hover:opacity-80"
          style={{ color: 'var(--color-accent, #58a6ff)' }}
        >
          <span>{expanded ? '\u25BC' : '\u25B6'}</span>
          <span>Implementation</span>
        </button>
        {expanded && (
          <div className="mt-2 relative">
            <button
              onClick={handleCopy}
              className="absolute top-2 right-2 text-xs px-2 py-1 rounded hover:opacity-80"
              style={{
                backgroundColor:
                  'var(--color-bg-tertiary, rgba(130,130,130,0.2))',
                color: 'var(--color-text)',
              }}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <pre
              className="p-3 rounded text-xs overflow-x-auto whitespace-pre-wrap"
              style={{
                backgroundColor:
                  'var(--color-bg-tertiary, rgba(130,130,130,0.1))',
              }}
            >
              {item.implementationPrompt}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 5: Update `InsightsTab` to render tool recommendations first**

In the `InsightsTab` component, add the tool recommendations `CategorySection` as the first category, before CLAUDE.md Recommendations:

```tsx
<CategorySection
  title="Tool & Guardrail Recommendations"
  items={insights.categories.toolRecommendations}
  renderItem={(item: ToolRecommendationItem, index: number) => (
    <ToolRecommendationCard key={index} item={item} />
  )}
/>
```

**Step 6: Run tests to verify they pass**

Run: `npm run test --workspace=packages/frontend -- --run components/__tests__/insights-tab`
Expected: PASS

**Step 7: Run full frontend tests**

Run: `npm run test --workspace=packages/frontend -- --run`
Expected: PASS

**Step 8: Commit**

```bash
git add packages/frontend/src/components/insights-tab.tsx packages/frontend/src/components/__tests__/insights-tab.test.tsx
git commit -m "feat: add tool recommendation cards with collapsible implementation prompt (#14)"
```

---

### Task 4: Workflow Analyzer Skill — Add tooling audit and tool recommendations category

**Files:**

- Modify: `skills/agent-shepherd-workflow-analyzer/SKILL.md`

**Step 1: Add "Tool & Guardrail Recommendations" as Output Category #1**

Insert before the existing "CLAUDE.md Recommendations" section (currently ### 1). Renumber all existing categories (CLAUDE.md becomes ### 2, etc.):

```markdown
### 1. Tool & Guardrail Recommendations

Specific tools, linters, hooks, or CI checks that could automatically enforce what the reviewer flagged. These are the strongest guardrails because they actively block or auto-fix issues rather than relying on the agent to read instructions.

Before making recommendations, audit the project's existing tooling:

- `package.json` (deps and devDeps) for installed tools
- Lint configs (`.eslintrc`, `eslint.config.*`, `.prettierrc`, etc.)
- `.claude/settings.json` for existing Claude Code hooks (PreToolUse, PostToolUse)
- Pre-commit config (`.husky/`, `.pre-commit-config.yaml`, lint-staged config)
- CI config if present (`.github/workflows/`)

When recommending, always note what's already installed and explain what gap the recommendation fills. If a better tool exists for something already configured, recommend the transition with rationale.

Tool recommendations are NEVER auto-applied regardless of confidence. The `implementationPrompt` field must be written as a self-contained prompt that could be pasted into an agent session to implement the recommendation.

Examples:

- "Add eslint-plugin-sonarjs — ESLint is installed but has no cognitive complexity rules. The agent introduced deeply nested conditionals in 3 files that sonarjs would catch."
- "Add a PostToolUse hook for `tsc --noEmit` — the agent committed type errors in 2 files that TypeScript would have caught. Currently no type-checking hook is configured."
- "Switch from jshint to ESLint — jshint is installed but ESLint has better plugin ecosystem for the patterns the reviewer keeps flagging."
```

**Step 2: Add tooling audit step to Analysis Workflow**

Insert as a new step between "Read session transcripts" (step 3) and "Correlate transcripts with comments" (step 4). Renumber subsequent steps:

```markdown
4. **Audit project tooling** -- Before producing recommendations, inspect the project's installed tools and configuration. Check `package.json` devDependencies, lint configs, `.claude/settings.json` hooks, pre-commit hooks, and CI workflows. Note what's already in place — this context informs whether to recommend new tools, config changes, or transitions.
```

**Step 3: Update Placement Priority**

Replace the existing placement priority list:

```markdown
1. **Tool & Guardrail Recommendations** — a tool exists (or could be installed) that would automatically enforce this. The fix is automated enforcement, not a written rule.
2. **CLAUDE.md Recommendations** — the fix is a concrete rule that would prevent the issue, and you're confident the rule is right
3. **Skill Recommendations** — the fix is a new or modified skill, and you're confident the change is correct
4. **Prompt & Context Engineering** — the root cause is the human's input or context, not the agent's behavior
5. **Recurring Pattern Alerts** — this is a cross-PR trend (evidence from 2+ PRs) without a clear single-category fix yet
6. **Agent Behavior Observations** — the issue doesn't yet have a confident actionable fix; use this as a holding category until evidence supports a concrete recommendation
```

**Step 4: Update JSON output format**

Add `toolRecommendations` to the example JSON structure:

```json
"toolRecommendations": [
  {
    "title": "Short title",
    "description": "Gap analysis — what's installed, what's missing, why this tool helps",
    "confidence": "high",
    "implementationPrompt": "Self-contained agent-ready prompt to implement this recommendation. Include install commands, config changes, and verification steps."
  }
]
```

**Step 5: Update confidence level documentation**

Add a note under confidence levels that tool recommendations are never auto-applied:

```markdown
**Exception:** Tool & Guardrail Recommendations are never auto-applied regardless of confidence level. Always describe only — the human decides whether to install tooling.
```

**Step 6: Commit**

```bash
git add skills/agent-shepherd-workflow-analyzer/SKILL.md
git commit -m "feat: add tool recommendations category and tooling audit to workflow analyzer skill (#14)"
```

---

### Task 5: Build verification and final check

**Files:** None (verification only)

**Step 1: Run full build**

Run: `npm run build`
Expected: SUCCESS with zero TypeScript errors

**Step 2: Run all tests**

Run: `npm run test -- --run`
Expected: PASS

**Step 3: Run lint**

Run: `npm run lint`
Expected: PASS

**Step 4: Run coverage check**

Run: `npm run test:coverage`
Expected: All packages at or above 80% threshold

**Step 5: Commit any remaining changes (if needed)**

Only if previous steps revealed issues that required fixes.
