# Insights Enhancements Design

**Date:** 2026-03-07
**Branch:** feat/insights

## Overview

Three enhancements to the insights analysis system:

1. Confidence levels on all recommendations with a three-tier action model
2. CLAUDE.md best practices context baked into the workflow-analyzer skill
3. Cycle deduplication via timestamps, git history, and prompt guidance

## 1. Confidence Levels

### Data Model

Every recommendation item across all five insight categories gets a required `confidence` field and an optional `appliedPath` field (replacing the boolean `applied`):

```typescript
interface InsightItem {
  title: string;
  description: string;
  confidence: 'high' | 'medium' | 'low';
  appliedPath?: string; // present = applied, value = target file path
}
```

- `appliedPath` being present means the recommendation was applied. The value is the file path (e.g., `"CLAUDE.md"`, `".claude/rules/api-validation.md"`).
- Migration: existing `applied: true` items become `appliedPath: "CLAUDE.md"`. The `applied` boolean is removed entirely.
- The `categories` column is already a JSON blob, so no DB migration is needed -- only TypeScript type changes and a data migration for existing rows.

### Three-Tier Action Model

| Confidence | Agent Action                                          | UI Display                        |
| ---------- | ----------------------------------------------------- | --------------------------------- |
| **High**   | Auto-commits the change to the recommended location   | Green badge, shows `appliedPath`  |
| **Medium** | Writes the recommendation but does NOT commit changes | Yellow badge, user can act on it  |
| **Low**    | Writes the recommendation only                        | Gray badge, marked as speculative |

### Confidence Definitions (for prompt)

- **High**: Clear, repeated pattern with strong evidence from transcripts; the fix is well-scoped and low-risk.
- **Medium**: Likely a real issue with a reasonable fix, but evidence is limited or the fix could have unintended side effects.
- **Low**: Possible pattern worth considering, but could be a one-off or context-dependent.

## 2. CLAUDE.md Best Practices

A new section added to the `workflow-analyzer` skill with curated guidance from Anthropic's official documentation. Source URL and review date are commented at the top of the section.

Source: https://code.claude.com/docs/en/memory#claudemd-files (reviewed 2026-03-07)

### Location Decision Matrix

| Situation                                      | Recommended Location                                          |
| ---------------------------------------------- | ------------------------------------------------------------- |
| Simple universal convention                    | Add directly to `CLAUDE.md`                                   |
| Detailed topic that would bloat CLAUDE.md      | Create separate file, add `@path/to/file` import in CLAUDE.md |
| Rule scoped to specific file types/directories | Create `.claude/rules/filename.md` with `paths` frontmatter   |

### Key Principles

- Keep CLAUDE.md under 200 lines -- use imports and `.claude/rules/` to offload detail.
- Be specific and concrete -- verifiable instructions, not vague guidance (e.g., "use 2-space indentation" not "format code properly").
- Avoid conflicting instructions across files.
- Use `paths` frontmatter in `.claude/rules/` to scope rules to specific file patterns (e.g., `paths: ["src/api/**/*.ts"]`).
- CLAUDE.md serves as a "lookup matrix" -- an index pointing agents to the right context for a given situation.

### Agent Harness Note

This guidance is currently specific to Claude Code's CLAUDE.md system. Future agent harnesses may use different configuration mechanisms. The location recommendation logic should be kept modular for eventual adaptation.

## 3. Cycle Deduplication

Purely prompt/skill changes -- no infrastructure work.

### Context Passed to Agent

When previous insights exist, the prompt includes:

- The `updatedAt` timestamp from the most recent insights record.
- Instruction to run `git log --since="[updatedAt]"` on the branch to identify new commits.

### Prompt Guidance

The agent is instructed to:

1. **Review previous findings** via `insights get`. Do not re-report existing recommendations.
2. **Use `git log`** to identify commits made since the last analysis. Focus on sessions that produced new work.
3. **Treat prior comments as already addressed**: Comments from review cycles prior to `updatedAt` have already been factored into existing recommendations. Do not count them as additional evidence for a pattern. They may be referenced for context when analyzing newer comments, but should not inflate confidence or cause duplicate findings.
4. **Update, don't duplicate**: If a previous finding is now better supported by additional evidence, update its confidence level or description rather than creating a duplicate.
5. **Accept no-ops**: If no meaningful new patterns emerge, return existing insights unchanged.

## 4. Frontend Changes

### Confidence Badges

Colored pill badges on each recommendation item:

- **Green** pill with "High" text
- **Yellow** pill with "Medium" text
- **Gray** pill with "Low" text

Positioned next to the item title, consistent with existing badge patterns in the app.

### Applied Path Display

When `appliedPath` is present, show "Applied to `<path>`" label below the description. Replaces the previous boolean-based applied indicator.

No new pages or layout changes.

## Files to Modify

| Area                    | Files                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| Shared types            | `packages/shared/src/types.ts`                                                            |
| DB schema / migration   | `packages/backend/src/db/schema.ts`                                                       |
| Insights prompt builder | `packages/backend/src/orchestrator/insights/prompt-builder.ts`                            |
| Workflow-analyzer skill | Skill file (CLAUDE.md best practices section)                                             |
| Insights routes         | `packages/backend/src/routes/insights.ts` (data migration for `applied` -> `appliedPath`) |
| Frontend insights UI    | `packages/frontend/src/pages/PRReview.tsx` (or relevant insights component)               |
| Tests                   | Update existing insight analyzer and prompt builder tests                                 |
