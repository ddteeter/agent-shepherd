# Agent Shepherd - Design Document

**Date:** 2026-02-24
**Status:** Approved

## Overview

Agent Shepherd is a local application that provides a human-in-the-loop pull request review workflow for AI coding agents. It replicates the standard human PR process: an AI agent acts as the code author, a human reviews the code, and they cycle through feedback until the human approves.

## Core Workflow

1. Human works with an agent to plan a feature
2. Agent executes the plan and completes implementation
3. Agent submits a local PR via the `shepherd` CLI, attaching structured context
4. Human receives a notification that a PR is ready for review
5. Human opens the web UI, reviews code diffs, adds inline comments with severity levels
6. Human approves or requests changes
7. On "request changes": the orchestrator kicks off the agent with all comments
8. Agent makes changes and/or replies to comments, then signals ready for re-review
9. Cycle repeats until approved

## Architecture

Single Node.js/TypeScript application:

- **Backend** (Fastify + SQLite) -- PR state, comments, review cycles, git operations, agent orchestration
- **Web Frontend** (React + git-diff-view) -- GitHub-like PR review interface
- **CLI** (`shepherd`) -- Used by agents and humans to submit PRs, post comments, signal readiness
- **Agent Orchestrator** -- Spawns and manages agent processes, starting with Claude Code CLI

```
Human <-> Web UI <-> Backend API <-> SQLite
                        |
Agent <-> CLI tool <-> Backend API
                        |
              Agent Orchestrator -> Claude Code CLI
```

### Multi-Project Support

The backend manages multiple projects, each pointing to a local git repository. PRs are scoped to a project. The web UI has a project switcher.

### Configuration Hierarchy

Global config (`~/.shepherd/config.yml`) -> Per-project config (`.shepherd.yml` in repo root) -> Web UI overrides (stored in SQLite, exportable to config file). Each level overrides the previous.

## Data Model

### Project

| Field      | Type        | Description                      |
| ---------- | ----------- | -------------------------------- |
| id         | TEXT (UUID) | Primary key                      |
| name       | TEXT        | Display name                     |
| path       | TEXT        | Absolute path to git repository  |
| baseBranch | TEXT        | Default base branch (e.g., main) |
| createdAt  | DATETIME    | Creation timestamp               |

### PullRequest

| Field          | Type        | Description                       |
| -------------- | ----------- | --------------------------------- |
| id             | TEXT (UUID) | Primary key                       |
| projectId      | TEXT        | FK to Project                     |
| title          | TEXT        | PR title                          |
| description    | TEXT        | PR description                    |
| sourceBranch   | TEXT        | Feature branch                    |
| baseBranch     | TEXT        | Target branch                     |
| status         | TEXT        | open / approved / closed          |
| agentContext   | TEXT (JSON) | Structured context from the agent |
| agentSessionId | TEXT        | Agent session ID for resume mode  |
| createdAt      | DATETIME    | Creation timestamp                |
| updatedAt      | DATETIME    | Last update timestamp             |

### ReviewCycle

| Field            | Type        | Description                                                               |
| ---------------- | ----------- | ------------------------------------------------------------------------- |
| id               | TEXT (UUID) | Primary key                                                               |
| prId             | TEXT        | FK to PullRequest                                                         |
| cycleNumber      | INTEGER     | Sequential cycle number                                                   |
| status           | TEXT        | pending_review / in_review / changes_requested / pending_agent / approved |
| reviewedAt       | DATETIME    | When human submitted review                                               |
| agentCompletedAt | DATETIME    | When agent signaled ready                                                 |

### Comment

| Field           | Type        | Description                     |
| --------------- | ----------- | ------------------------------- |
| id              | TEXT (UUID) | Primary key                     |
| reviewCycleId   | TEXT        | FK to ReviewCycle               |
| filePath        | TEXT        | File the comment is on          |
| startLine       | INTEGER     | Start line of selection         |
| endLine         | INTEGER     | End line of selection           |
| body            | TEXT        | Comment text                    |
| severity        | TEXT        | suggestion / request / must-fix |
| author          | TEXT        | human / agent                   |
| parentCommentId | TEXT        | FK to Comment (for threads)     |
| resolved        | BOOLEAN     | Whether the comment is resolved |
| createdAt       | DATETIME    | Creation timestamp              |

### DiffSnapshot

| Field         | Type        | Description         |
| ------------- | ----------- | ------------------- |
| id            | TEXT (UUID) | Primary key         |
| reviewCycleId | TEXT        | FK to ReviewCycle   |
| diffData      | TEXT (JSON) | Parsed unified diff |

### ProjectConfig / GlobalConfig

Key-value stores for web UI config overrides.

## API

### REST Endpoints

| Endpoint                   | Method         | Purpose                                 |
| -------------------------- | -------------- | --------------------------------------- |
| `/api/projects`            | GET/POST       | List/register projects                  |
| `/api/projects/:id`        | GET/PUT/DELETE | Manage a project                        |
| `/api/projects/:id/prs`    | GET/POST       | List/create PRs for a project           |
| `/api/prs/:id`             | GET/PUT        | Get/update a PR                         |
| `/api/prs/:id/cycles`      | GET/POST       | List/create review cycles               |
| `/api/prs/:id/diff`        | GET            | Get diff for current cycle              |
| `/api/prs/:id/comments`    | GET/POST       | List/add comments                       |
| `/api/comments/:id`        | PUT/DELETE     | Update/delete a comment                 |
| `/api/prs/:id/review`      | POST           | Submit review (approve/request-changes) |
| `/api/prs/:id/agent-ready` | POST           | Agent signals PR ready for re-review    |
| `/api/config`              | GET/PUT        | Global config                           |
| `/api/projects/:id/config` | GET/PUT        | Project config                          |

### WebSocket Events

- `pr:created`, `pr:updated`, `pr:ready-for-review`
- `comment:added`, `comment:updated`
- `review:submitted`
- `agent:working`, `agent:completed`

## CLI (`shepherd`)

```
shepherd init <path>                              # Register a project
shepherd submit [--title] [--context-file]        # Submit a PR from current branch
shepherd comment <pr-id> <file:line> <body>       # Add a single comment
shepherd reply <comment-id> <body>                # Reply to a comment thread
shepherd batch <pr-id> --file <json-file>         # Batch submit comments/replies
shepherd batch <pr-id> --stdin                    # Batch from stdin
shepherd ready <pr-id>                            # Signal PR ready for re-review
shepherd ready <pr-id> --file <json-file>         # Batch comments + signal ready
shepherd status <pr-id>                           # Check PR status
shepherd config [--global] [key] [value]          # Get/set config
```

### Batch JSON Format

```json
{
  "comments": [
    {
      "filePath": "src/index.ts",
      "startLine": 42,
      "endLine": 42,
      "body": "...",
      "severity": "suggestion"
    }
  ],
  "replies": [
    { "commentId": "abc123", "body": "Good point, I've updated this." },
    { "commentId": "def456", "body": "I'd push back here because..." }
  ]
}
```

## Agent Orchestrator

### Flow on "Request Changes"

1. Backend collects all comments from current review cycle
2. Orchestrator builds a structured prompt:
   - System context: review response guidelines (from config)
   - PR context: agent's attached context (summary, decisions, plan)
   - Comments: grouped by file, each with severity, line range, body, thread history
   - Instructions by severity:
     - `must-fix`: Make the change, no discussion
     - `request`: Make the change unless strong technical reason not to (explain in reply)
     - `suggestion`: Use judgment -- fix or reply with reasoning
3. Orchestrator spawns the agent:
   - **Resume mode (default):** `claude --resume <sessionId> --yes -p "<prompt>"`
   - **New session mode:** `claude --yes -p "<full context + prompt>"` in the project directory
4. Agent works, uses `shepherd batch` or individual CLI commands to post replies
5. Agent calls `shepherd ready <pr-id>`
6. Backend creates new DiffSnapshot, updates cycle status, sends notification

### Session Mode (Configurable)

- **Resume (default):** Agent retains full context of what it built. Best for natural "author responding to review" experience. Risk: context window fills over many cycles.
- **New session:** Clean context. Agent context attachment is injected into prompt. Better for long-lived PRs with many rounds.

### Agent Context Attachment

When submitting a PR, the agent attaches structured context:

- Summary of what was built and why
- Key architectural decisions and trade-offs
- The original plan/spec reference
- Notes for future sessions

This context is stored with the PR and injected into new sessions or available as reference in resumed sessions.

### Agent Adapter Interface

```typescript
interface AgentAdapter {
  name: string;
  startSession(opts: {
    projectPath: string;
    prompt: string;
  }): Promise<AgentSession>;
  resumeSession(opts: {
    sessionId: string;
    prompt: string;
  }): Promise<AgentSession>;
}

interface AgentSession {
  id: string;
  onComplete(callback: () => void): void;
  onError(callback: (error: Error) => void): void;
  kill(): Promise<void>;
}
```

Starting with a Claude Code adapter. Future adapters for Cursor, Aider, etc.

## Web Frontend

### Technology

React + TypeScript, `git-diff-view` + `@git-diff-view/shiki`, Vite, Tailwind CSS.

### Pages

1. **Dashboard** -- Project list with open PRs and notification badges
2. **Project View** -- PR list with open/approved/closed tabs
3. **PR Review View** -- The main interface:
   - Left sidebar: file tree with change indicators and comment counts
   - Right pane: code diff (split/unified toggle) via `git-diff-view`
   - Inline comments: click line or select range to add comment with severity dropdown
   - Threaded conversations below diff lines via `git-diff-view` widget API
   - PR header: title, description, branch info, expandable agent context, cycle history
   - Review submission: "Approve" or "Request Changes" button
   - Agent status indicator: working / idle / waiting for review
4. **Settings** -- Global and per-project config (review prompt, agent mode, themes, notifications)

### Comment System

- Click a line or select a range to add a comment
- Severity dropdown: suggestion / request / must-fix
- Comments render as threaded conversations below the relevant diff lines
- Agent replies appear in the same threads
- Comments can be marked as resolved

### Theming

CSS custom properties for customizable themes. Ships with light and dark themes. Custom themes definable in config.

### Notifications

- Web Notifications API for browser-level notifications
- `node-notifier` for OS-level notifications (macOS notification center)
- WebSocket-driven badge updates in the web UI

### Inter-Cycle Diff

Besides the main base-to-branch diff, the UI offers a "Changes since last review" view that diffs between cycles. Critical for efficient re-reviews.

## Skills (Claude Code Integration)

### `shepherd:submit-pr`

Teaches the agent how to commit changes, structure context, and submit a PR via the CLI. Includes guidance on what makes good PR context.

### `shepherd:respond-to-review`

Teaches the agent how to interpret review comments by severity, when to defend code vs. accept feedback, how to structure batch replies, and when to make code changes vs. reply with reasoning. Content is also embedded by the orchestrator in automated mode.

### `shepherd:context-guidelines`

Guides the agent on what context to capture when submitting PRs: summary, architectural decisions, trade-offs, known concerns, plan reference.

## Technology Stack

| Component      | Technology                               | Rationale                                       |
| -------------- | ---------------------------------------- | ----------------------------------------------- |
| Runtime        | Node.js + TypeScript                     | User preference, ecosystem                      |
| Backend        | Fastify                                  | Fast, TypeScript-friendly, WebSocket plugin     |
| Database       | SQLite via `better-sqlite3`              | Zero setup, local, fast                         |
| ORM            | Drizzle ORM                              | Lightweight, type-safe, great SQLite support    |
| Frontend       | React + TypeScript                       | Ecosystem, git-diff-view support                |
| Build          | Vite                                     | Fast dev server                                 |
| Diff rendering | `git-diff-view` + `@git-diff-view/shiki` | ~40kB, widget API, VS Code-quality highlighting |
| Styling        | Tailwind CSS + CSS custom properties     | Rapid dev, theming                              |
| WebSocket      | `@fastify/websocket`                     | Native Fastify integration                      |
| CLI            | `commander`                              | Standard Node.js CLI                            |
| Git            | `simple-git`                             | Clean API for git operations                    |
| Notifications  | Web Notifications API + `node-notifier`  | Browser + OS notifications                      |
| Testing        | Vitest                                   | Fast, Vite-native                               |
| Monorepo       | npm workspaces                           | Manage CLI, backend, frontend packages          |

### Future / Optional

- Semantic diff via `web-tree-sitter` for AST-based diffing
- MCP server as alternative agent integration path

## Review Workflow Edge Cases

- **Comments during agent work:** Queue for next cycle
- **Agent crash:** Detect process exit, show error state, offer retry
- **Multiple PRs same project:** One agent process at a time, queued
- **PR abandoned:** Human can close PR, stops any running agent
- **Diff between cycles:** Each cycle stores its own diff snapshot for comparison
