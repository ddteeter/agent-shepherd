# Insights Agent Noise Reduction

**Issue:** [#3](https://github.com/ddteeter/agent-shepherd/issues/3)
**Date:** 2026-03-14

## Problem

The insights agent produces positive observations ("the agent did a good job reading tests first") that add noise without actionable value. It also appears to invent recommendations to fill every category, even when there's nothing meaningful to report.

## Root Cause

The workflow-analyzer skill's instructions say "Fill all 5 categories" and don't explicitly tell the agent that:

1. Only problems/improvements should be reported
2. Empty categories are perfectly acceptable

## Solution

Prompt-only fix in `skills/agent-shepherd-workflow-analyzer/SKILL.md`:

1. **Add two principles** to the Principles section:
   - "Only report problems and improvements" — positive observations are noise
   - "Empty categories are expected" — don't invent findings to fill every category

2. **Clarify Agent Behavior Observations** category description to reinforce: only report behaviors that need to change

## Alternatives Considered

- **Output format change** (add `type` field to filter positives): overengineered — if we don't want positives, don't ask for them
- **Backend filtering**: fragile, wrong layer to solve a prompt problem
