---
name: agent-shepherd:submit-pr
description: Use when submitting a PR for human review through Agent Shepherd. Guides commit preparation, context file creation, and the agent-agent-shepherd submit workflow.
---

# Skill: Submit a PR via Agent Shepherd

## When to Use

Use this skill after you have finished implementing a feature or completing a task and need to submit your work for human review through Agent Shepherd.

## Prerequisites

- The Agent Shepherd backend must be running (default: `http://localhost:3847`)
- The project must already be registered with `agent-shepherd init <path>`
- You must know the project ID (check with the backend API or your session context)

## Step-by-Step Workflow

### 1. Ensure All Changes Are Committed

Before submitting, make sure your working tree is clean. The PR diff is computed from git, so uncommitted changes will not appear in the review.

```bash
# Check for uncommitted changes
git status

# Stage and commit everything relevant
git add <files...>
git commit -m "Implement feature X: brief description"
```

Do NOT use `git add .` blindly. Review what you are staging. Avoid committing generated files, secrets, or `.env` files.

### 2. Write a Context File

Create a JSON file that captures structured context about what you built. This context is stored with the PR and will be injected into future agent sessions if the review requires multiple rounds.

Create a file (e.g., `pr-context.json`):

```json
{
  "summary": "Implemented the user authentication flow including login, logout, and session management.",
  "architecturalDecisions": [
    "Used JWT tokens stored in httpOnly cookies rather than localStorage for security.",
    "Added a middleware layer that validates tokens on every API request.",
    "Chose bcrypt for password hashing with a cost factor of 12."
  ],
  "tradeOffs": [
    "JWT tokens cannot be individually revoked without a blacklist. Accepted this trade-off because sessions are short-lived (1 hour).",
    "bcrypt cost factor of 12 adds ~250ms to login. Acceptable for this use case."
  ],
  "planReference": "docs/plans/2026-02-24-auth-implementation.md",
  "knownLimitations": [
    "No refresh token flow yet -- sessions simply expire.",
    "Rate limiting on login endpoint is not implemented."
  ],
  "notesForFutureSessions": [
    "If resuming this work, the session middleware is in src/middleware/auth.ts.",
    "The token signing key is loaded from config, not hardcoded.",
    "Tests for the auth flow are in src/__tests__/auth.test.ts."
  ]
}
```

See the `agent-shepherd:context-guidelines` skill for detailed guidance on what to include in context.

### 3. Submit the PR

```bash
agent-shepherd submit \
  --project <project-id> \
  --title "Add user authentication flow" \
  --description "Implements login, logout, and session management with JWT tokens." \
  --context-file pr-context.json \
  --session-id <your-session-id>
```

**Flags:**

| Flag | Required | Description |
|---|---|---|
| `-p, --project <id>` | Yes | The project ID this PR belongs to |
| `-t, --title <title>` | No | PR title (defaults to "Agent PR" -- always provide a real title) |
| `-d, --description <desc>` | No | Short PR description |
| `-s, --source-branch <branch>` | No | Source branch (auto-detected from HEAD if omitted) |
| `-c, --context-file <path>` | No | Path to JSON file with structured agent context |
| `--session-id <id>` | No | Your agent session ID, used for resume mode in future review cycles |

The command outputs the PR ID, title, and status on success. Save the PR ID -- you will need it if responding to review comments later.

### 4. Verify Submission

After submitting, verify the PR was created:

```bash
agent-shepherd status <pr-id>
```

This shows the PR title, status (`open`), branch info, and current review cycle.

## Writing a Good PR Title

- Be specific: "Add JWT-based authentication flow" not "Add auth"
- Use imperative mood: "Add", "Fix", "Refactor", not "Added", "Fixing"
- Keep it under 70 characters
- Include the scope: "Fix race condition in WebSocket reconnection logic"

## Writing a Good PR Description

The description appears in the review UI alongside the diff. Keep it concise but informative:

- What does this PR do? (1-2 sentences)
- Why? (Link to plan/spec if applicable)
- Any special instructions for the reviewer (e.g., "Focus review on the error handling in src/api/handler.ts")

## Common Mistakes to Avoid

1. **Submitting with uncommitted changes.** The diff is computed from git. If you forgot to commit, the reviewer sees nothing or an incomplete diff.
2. **Using the default title.** "Agent PR" tells the reviewer nothing. Always provide a descriptive title.
3. **Skipping the context file.** If the review requires changes (which it often does), the context file is critical for maintaining continuity across review cycles. Always provide one.
4. **Committing secrets or .env files.** Review your staged files before committing.
5. **Not providing a session ID.** Without a session ID, the orchestrator cannot resume your session and must start fresh, losing all your in-memory context.
