# Insights Tool Recommendations Design

**GitHub Issue:** #14
**Date:** 2026-03-15

## Problem

The insights system recommends CLAUDE.md rules, skills, and prompt coaching — but never recommends tooling or guardrails (linters, hooks, CI checks). Tools are the most reliable guardrails because they actively block or auto-fix issues rather than relying on the agent to read and follow instructions. Users may not know what tooling options exist, so surfacing recommendations gives them optionality.

## Design Decisions

- **New dedicated category** `toolRecommendations` added as **highest priority** in the placement chain, above CLAUDE.md Recommendations
- **Never auto-applied** — tool recommendations always require human action, regardless of confidence level, because tooling changes (installing packages, modifying configs) have broad side effects
- **Broad scope** — the analyzer can recommend tools already in the project ecosystem, Claude Code hooks, and entirely new tools the user may not be aware of
- **Project-aware** — the analyzer audits the project's existing tooling before making recommendations, and can recommend transitions when a better tool exists for the gap
- **Agent-ready implementation prompts** — each recommendation includes an `implementationPrompt` field written so it can be pasted directly into an agent session
- **Actionable** — each recommendation includes the tool name, why it helps, what gap it fills vs current tooling, and concrete implementation steps

## Type Changes

### Shared Types (`packages/shared/src/types.ts`)

New interface:

```typescript
export interface ToolRecommendationItem {
  title: string;
  description: string; // Why: gap analysis, current tooling context
  confidence: InsightConfidence;
  implementationPrompt: string; // Agent-ready prompt to implement the recommendation
}
```

Updated `InsightCategories`:

```typescript
export interface InsightCategories {
  toolRecommendations: ToolRecommendationItem[]; // NEW — highest priority
  claudeMdRecommendations: InsightItem[];
  skillRecommendations: InsightItem[];
  promptEngineering: InsightItem[];
  agentBehaviorObservations: InsightItem[];
  recurringPatterns: RecurringPatternItem[];
}
```

## Workflow Analyzer Skill Changes

### New Output Category: Tool & Guardrail Recommendations (Priority #1)

Inserted at the top of the Output Categories. The skill teaches the analyzer to:

- Identify gaps where automated tooling could have caught the issue the reviewer flagged
- Recommend specific tools with concrete implementation prompts
- Cover the full spectrum: linters, formatters, pre-commit hooks, Claude Code hooks, CI checks, static analysis, new packages

### New Analysis Step: Tooling Audit

Added to the Analysis Workflow before producing recommendations. The analyzer inspects:

- `package.json` (deps and devDeps) for installed tools
- Lint configs (`.eslintrc`, `eslint.config.*`, `.prettierrc`, etc.)
- `.claude/settings.json` for existing hooks
- Pre-commit config (`.husky/`, `.pre-commit-config.yaml`, lint-staged config)
- CI config if present (`.github/workflows/`)

This gives the analyzer awareness of what's already in place so it can recommend additions, config changes, or transitions to better tools.

### Updated Placement Priority

1. **Tool & Guardrail Recommendations** — a tool exists that could enforce this automatically
2. **CLAUDE.md Recommendations** — concrete rule, confident it's right
3. **Skill Recommendations** — new/modified skill
4. **Prompt & Context Engineering** — root cause is the human's input
5. **Recurring Pattern Alerts** — cross-PR trend, no clear fix yet
6. **Agent Behavior Observations** — uncertain, holding category

### Constraints

- Tool recommendations are never auto-applied regardless of confidence
- Each recommendation must include `implementationPrompt` written as an agent-ready prompt
- The analyzer notes what current tooling exists and why the recommendation fills a gap or improves on it

## Backend Changes

### Migration Function (`packages/backend/src/routes/insights.ts`)

`migrateInsightCategories` adds `toolRecommendations` defaulting to `[]` for existing data. Same pattern as other categories.

### No DB Schema Changes

Categories are stored as a JSON blob in the `categories` TEXT column. Adding a new key requires no migration — existing rows just won't have `toolRecommendations`, and the migration function handles the default.

### No Route Changes

GET and PUT routes are generic — they serialize/deserialize categories JSON without knowing specific keys. Only the migration function is category-aware.

## Frontend Changes

### New `ToolRecommendationCard` Component

Extends the existing `InsightCard` pattern with:

- Title, confidence badge, and description always visible (same as other cards)
- Collapsible "Implementation" section, **collapsed by default**
- Inside the collapsible: the `implementationPrompt` rendered in a styled pre/code block
- "Copy" button that copies the implementation prompt to clipboard

### `InsightsTab` Updates

- New `CategorySection` for "Tool & Guardrail Recommendations" rendered **first**, above CLAUDE.md Recommendations
- Uses `ToolRecommendationCard` instead of `InsightCard` for items in this category

### Local Types

`ToolRecommendationItem` interface added to the local types in `insights-tab.tsx` to match the existing pattern (types are duplicated locally in the frontend component).

## Prompt Builder

No changes needed. The prompt builder delegates methodology to the `agent-shepherd:workflow-analyzer` skill. The skill itself teaches the analyzer about the new category and tooling audit step.

## CLI

No changes needed. The `insights update` command accepts arbitrary JSON categories and passes them through to the backend.

## JSON Output Format

```json
{
  "categories": {
    "toolRecommendations": [
      {
        "title": "Add eslint-plugin-sonarjs for cognitive complexity",
        "description": "Agent introduced deeply nested conditionals in 3 files. ESLint is installed but no complexity rules are configured. sonarjs catches cognitive complexity, duplicate branches, and identical expressions.",
        "confidence": "high",
        "implementationPrompt": "Install eslint-plugin-sonarjs as a dev dependency and add it to the ESLint config..."
      }
    ],
    "claudeMdRecommendations": [],
    "skillRecommendations": [],
    "promptEngineering": [],
    "agentBehaviorObservations": [],
    "recurringPatterns": []
  }
}
```
