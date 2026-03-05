# Insights: Automated Workflow Analysis

## Problem

Agent Shepherd provides a human-in-the-loop review flow for AI coding agents. When the human requests changes, they're correcting the agent's output -- but the corrections only fix the code. The underlying workflow problems (poor prompts, missing CLAUDE.md rules, absent skills, recurring mistakes) persist across sessions.

## Solution

When the human requests changes, Shepherd spawns a second agent in parallel with the code-fix agent. This "insights analyzer" reads the agent's session transcripts and Shepherd's comment history to produce workflow improvement recommendations. It closes the feedback loop not just on the code, but on the agent's behavior and the human's setup.

## Architecture

### Orchestrator Refactor

The current monolithic `Orchestrator` is refactored into a thin coordinator that delegates to feature modules:

```
Orchestrator (thin coordinator)
├── AgentRunner (shared lifecycle: spawn, track, broadcast, cleanup)
├── review/FeedbackIntegrator (code-fix agent logic)
└── insights/InsightsAnalyzer (workflow analysis logic)
```

Both modules use `AgentRunner` for agent lifecycle management, eliminating duplicate code.

### Module Layout

```
packages/backend/src/orchestrator/
├── index.ts                          # Orchestrator (thin coordinator)
├── agent-runner.ts                   # Shared agent lifecycle
├── types.ts                          # Shared types
├── session-log/
│   ├── provider.ts                   # SessionLogProvider interface
│   └── claude-code-provider.ts       # Claude Code implementation
├── review/
│   ├── feedback-integrator.ts
│   ├── prompt-builder.ts
│   └── __tests__/
├── insights/
│   ├── insights-analyzer.ts
│   ├── prompt-builder.ts
│   └── __tests__/
└── __tests__/
    ├── orchestrator.test.ts
    └── agent-runner.test.ts
```

### AgentRunner

Extracted from the current orchestrator's agent lifecycle logic. Both modules use it identically.

```typescript
interface AgentRunConfig {
  prId: string;
  projectPath: string;
  prompt: string;
  source: 'code-fix' | 'insights';
}

interface AgentRunCallbacks {
  onComplete: () => void;
  onError: (error: Error) => void;
}
```

Sessions are keyed by `${prId}:${source}` so both agents can run simultaneously for the same PR. Broadcast events include the `source` field so the frontend routes activity to the correct view.

### SessionLogProvider

Agent-agnostic interface for discovering session transcripts.

```typescript
interface SessionLog {
  sessionId: string;
  filePath: string;
  startedAt: string;
  branch: string;
}

interface SessionLogProvider {
  name: string;
  findSessions(opts: {
    projectPath: string;
    branch: string;
  }): Promise<SessionLog[]>;
}
```

**Claude Code implementation** (`ClaudeCodeSessionLogProvider`):
- Derives the Claude projects directory from `projectPath` using the `~/.claude/projects/<mangled-path>/` convention
- Scans `*.jsonl` files, reads first few lines to extract `sessionId`, `gitBranch`, timestamp
- Filters to sessions matching the requested branch
- Returns paths sorted by time (most recent first)

The interface exists to support future agent adapters (Copilot CLI).

## Insights Analyzer

### Trigger Points

1. **Automatic** -- when the human clicks "Request Changes", the analyzer runs in parallel with the code-fix agent
2. **On-demand** -- "Run Analyzer" button in the Insights tab

### Execution Flow

1. Query PR + project from DB
2. Discover session logs via `SessionLogProvider`
3. Create a worktree branched off the PR branch (`shepherd/insights/<prId>`)
4. Build analyzer prompt with dynamic context:
   - PR title, ID, branch
   - Session log file paths (paths only, not contents)
   - Instruction to use the analyzer skill
5. Spawn agent via `AgentRunner` with `source: 'insights'`
6. Agent reads session transcripts, queries comment history, produces recommendations
7. On complete: update `updatedAt` on insights row
8. On error: broadcast error, cleanup worktree

### Worktree Isolation

The analyzer runs in its own worktree to avoid filesystem conflicts with the code-fix agent running in the PR's worktree. File changes (CLAUDE.md updates, new skills) are committed to the insights branch and reviewed separately from code fixes.

### Data Sources

The analyzer reads two kinds of data:

1. **Branch session transcripts** -- full JSONL conversation logs from `~/.claude/projects/`. The agent reads these directly (no pre-processing) to preserve signal
2. **Shepherd comment history** -- cross-PR comment patterns accessed via `shepherd insights history <project-id>`

### Prompt + Skill Split

- **Prompt builder** (`insights/prompt-builder.ts`) -- assembles dynamic runtime context (session file paths, PR info, skill invocation instruction). Changes per run.
- **Analyzer skill** -- stable methodology file containing: how to read transcripts, the 5 output categories, how to correlate feedback with agent behavior, CLI commands, output format. Evolves independently.

### Output Categories

1. **CLAUDE.md recommendations** -- specific rules or instructions to add. Committed as file changes to the insights branch.
2. **Skill recommendations** -- new skills to create or existing skills to modify. Committed as file changes to the insights branch.
3. **Prompt/context engineering** -- coaching for the human on how they interact with agents. Examples: "Your initial prompt was 12 words -- the agent spent 40% of tokens exploring to figure out what you wanted", "You didn't respond to the agent's clarifying question so it guessed wrong". Displayed in UI only.
4. **Agent behavior observations** -- what the agent did wrong and why. Examples: "Agent explored the codebase for 40% of the session instead of starting work", "Agent added unnecessary error handling in 4 files". Displayed in UI only.
5. **Recurring pattern alerts** -- cross-PR trends detected from comment history. Examples: "3rd time reviewer flagged unnecessary error handling". Displayed in UI, references prior PRs.

## Data Model

### Insights Table

```sql
insights (
  id          TEXT PRIMARY KEY,    -- UUID
  pr_id       TEXT REFERENCES pull_requests(id),  -- one-to-one
  categories  TEXT,                -- JSON blob (5 categories)
  branch_ref  TEXT,                -- e.g. 'shepherd/insights/abc123'
  worktree_path TEXT,              -- for cleanup
  updated_at  TEXT
)
```

Insights are a single living document per PR, not versioned. The analyzer reads existing state via CLI and works additively. Rows are created lazily on first `shepherd insights update` call (upsert semantics) to avoid orphaned empty rows if the agent dies.

### Categories JSON Structure

```json
{
  "claudeMdRecommendations": [
    { "title": "Add testing convention", "description": "...", "applied": false }
  ],
  "skillRecommendations": [
    { "title": "Create error-handling skill", "description": "...", "applied": false }
  ],
  "promptEngineering": [
    { "title": "Initial prompt lacked acceptance criteria", "description": "..." }
  ],
  "agentBehaviorObservations": [
    { "title": "Agent explored codebase for 40% of session", "description": "..." }
  ],
  "recurringPatterns": [
    { "title": "3rd time: unnecessary error handling", "description": "...", "prIds": ["..."] }
  ]
}
```

## CLI Commands

- `shepherd insights get <pr-id>` -- returns current insights JSON. Analyzer calls this to read existing state and work additively.
- `shepherd insights update <pr-id> --stdin` -- upserts insights from stdin. Creates row if it doesn't exist.
- `shepherd insights history <project-id>` -- returns all comments across PRs for recurring pattern detection.

## API Routes

- `GET /api/prs/:id/insights` -- frontend fetches for the Insights tab
- `PUT /api/prs/:id/insights` -- CLI calls to upsert
- `GET /api/projects/:id/comments/history` -- cross-PR comment history for the analyzer

## Frontend

### Insights Tab

Always visible on the PR detail page (for discoverability), with three states:

1. **Empty state** -- no comments or sessions to analyze yet. Explains what insights are and when they become available. "Run Analyzer" button hidden.
2. **Ready / results available** -- "Run Analyzer" button visible. If insights exist, renders categories:
   - Each category as a collapsible section
   - CLAUDE.md and skill recommendations reference the insights branch
   - Prompt engineering and behavior observations rendered as cards
   - Recurring patterns show count and related PRs
3. **Analyzer running** -- agent activity stream (shared component with code-fix view, filtered by `source: 'insights'`). Cancel button available.

The "Run Analyzer" button appears when at least one of: comments exist on the PR, or session logs exist for the branch.

### Broadcast Events

Existing broadcast events gain a `source` field:
- `agent:working` -- `{ prId, source: 'code-fix' | 'insights' }`
- `agent:output` -- `{ prId, source, entry }`
- `agent:completed` -- `{ prId, source }`
- `agent:error` -- `{ prId, source, error }`

The frontend routes events to the appropriate view based on `source`.

## Orchestrator Public API

```typescript
class Orchestrator {
  // Existing -- now delegates to both modules
  async handleRequestChanges(prId: string): Promise<void>;

  // New -- on-demand insights
  async runInsights(prId: string): Promise<void>;

  // Updated -- accepts source to cancel specific agent
  async cancelAgent(prId: string, source?: 'code-fix' | 'insights'): Promise<void>;
}
```

Callers of `handleRequestChanges` see no API change. The insights analysis is an internal addition.

## Future Considerations

- **Subagent split**: If one analyzer agent becomes overloaded, split into specialized subagents per category (analyze-agent-behavior, analyze-prompt-quality, detect-recurring-patterns), each with its own skill.
- **Copilot CLI support**: Implement a second `SessionLogProvider` for Copilot CLI's log format.
- **Individual insight tracking**: If users need to mark insights as applied/dismissed, break the JSON blob into an `insight_items` table.
- **Cross-project patterns**: Extend recurring pattern detection beyond a single project.
