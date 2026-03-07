---
name: agent-shepherd:resubmit-pr
description: Use when resubmitting a PR for review after making changes outside the Agent Shepherd review flow. Guides context generation and the agent-shepherd resubmit workflow.
---

# Skill: Resubmit a PR via Agent Shepherd

## When to Use

Use this skill when changes have been made to a PR branch outside the normal Agent Shepherd review flow — for example, when working directly in Claude Code without going through "Request Changes." This creates a new review cycle so the human can review the updated code.

## Prerequisites

- The Agent Shepherd backend must be running (default: `http://localhost:3847`)
- The PR must already exist in Agent Shepherd (was previously submitted with `agent-shepherd submit`)
- Changes must be committed to the branch

## Step-by-Step Workflow

### 1. Ensure All Changes Are Committed

The diff is computed from git. Uncommitted changes will not appear in the review.

```bash
git status
git add <files...>
git commit -m "description of changes"
```

### 2. Find the PR ID

If you don't know the PR ID, find it:

```bash
agent-shepherd list-projects
# Then check the web UI or use the project ID to find the PR
```

### 3. Generate a Context File

Create a file (e.g., `resubmit-context.json`) that describes what changed and why. Analyze the diff and recent commits to build this context.

To understand what changed since the last cycle, review:
- `git log --oneline` for recent commits
- `git diff` against the base branch
- Any relevant discussion or decisions that led to the changes

Write a JSON file:

```json
{
  "summary": "What changed at a high level and why these changes were made outside the review flow.",
  "changesFromPreviousCycle": [
    "Describe each significant change relative to what was previously submitted.",
    "Focus on what a reviewer needs to know to understand the delta."
  ],
  "reasonForDirectChanges": "Why these changes were made directly rather than through the review flow (e.g., 'Iterated on the implementation in Claude Code based on initial testing').",
  "unresolvedFromPreviousCycle": [
    "Note any unresolved comments from previous cycles that these changes address.",
    "Or note that previous comments are still unresolved and need review."
  ]
}
```

### 4. Resubmit

```bash
agent-shepherd resubmit <pr-id> --context-file resubmit-context.json
```

This will:
- Mark the current cycle as `superseded`
- Create a new cycle with a fresh diff snapshot
- Store the context for the reviewer

### 5. Clean Up

Remove the temporary context file:

```bash
rm resubmit-context.json
```

### 6. Verify

```bash
agent-shepherd status <pr-id>
```

Confirm the new cycle was created and the PR is ready for review.
