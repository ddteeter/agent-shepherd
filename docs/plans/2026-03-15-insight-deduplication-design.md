# Insight Agent Deduplication Design

**Issue:** #18 — Insight Agent Duplicative Recommendations
**Date:** 2026-03-15

## Problem

The insight agent frequently places the same conceptual recommendation in multiple output categories. For example, "agent adds unnecessary error handling" might appear as a CLAUDE.md recommendation, an agent behavior observation, and a recurring pattern alert simultaneously.

## Root Cause

The 5 output categories have overlapping scopes by nature. The SKILL.md file defines each category independently but provides no guidance on where an insight should land when it fits multiple categories.

## Solution

Two additions to SKILL.md, no code changes:

### 1. Placement Priority Rule

A ranked decision matrix inserted after "Output Categories". For each insight, pick the single most appropriate category by walking this priority list top-to-bottom:

1. **CLAUDE.md Recommendations** — if the fix is a concrete, high-confidence rule
2. **Skill Recommendations** — if the fix is a new or modified skill, with confidence
3. **Prompt & Context Engineering** — if the root cause is the human's input
4. **Recurring Pattern Alerts** — if this is a cross-PR trend (2+ PRs) without a clear fix yet
5. **Agent Behavior Observations** — catch-all for issues without a confident actionable fix

Key qualifier: categories 1-2 are preferred only when the fix is well-understood and likely correct. If unsure the rule/skill change would actually help, the insight belongs in observations until there's enough evidence.

### 2. Deduplication Review Step

A new step 5.5 in the Analysis Workflow (between "Produce recommendations" and "For CLAUDE.md and skill recommendations"):

Before proceeding, review all recommendations across all 5 categories. For each insight, check whether the same conceptual problem appears in another category. If it does: keep it in the highest-priority category, remove from others, and fold any unique context from removed instances into the kept one.

## Scope

- **Changed:** `skills/agent-shepherd-workflow-analyzer/SKILL.md`
- **Not changed:** backend, frontend, CLI, database schema, prompt builder
