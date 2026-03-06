---
name: agent-shepherd:workflow-analyzer
description: Analyze agent session transcripts and review comment history to produce workflow improvement recommendations. Use when spawned by Agent Shepherd's insights analyzer to examine why an agent produced suboptimal output and how to prevent it.
---

# Skill: Workflow Analyzer

You are analyzing an AI coding agent's work to produce workflow improvement recommendations. Your goal is to close the feedback loop -- not just on the code, but on the agent's behavior and the human's setup.

## Data Sources

### 1. Session Transcripts (JSONL files)

Read the session log files provided in your prompt. These are JSONL files where each line is a JSON object. Key fields to look for:

- `type: "user"` -- human prompts and instructions
- `type: "assistant"` -- agent responses and reasoning
- `type: "tool_use"` -- tool calls (file reads, edits, bash commands)
- `type: "tool_result"` -- tool call results
- `type: "error"` -- errors encountered

When reading transcripts, focus on:
- **Initial prompt quality**: Was the human's request clear? Did it include acceptance criteria?
- **Exploration patterns**: How much time did the agent spend understanding vs. implementing?
- **Error recovery**: Did the agent get stuck? How did it recover?
- **Tool usage**: Were tools used efficiently? Were there unnecessary reads or redundant searches?
- **Decision points**: Where did the agent make choices that led to reviewer feedback?

### 2. Comment History

Use the CLI commands provided in your prompt to fetch:
- Current insights (work additively -- don't overwrite previous findings)
- Cross-PR comment history for recurring pattern detection

## Analysis Workflow

1. **Read existing insights** -- Call `shepherd insights get <pr-id>` first. If insights already exist, build on them rather than replacing them.

2. **Fetch comment history** -- Call `shepherd insights history <project-id>` to get all comments across PRs. Look for recurring themes.

3. **Read session transcripts** -- Read the JSONL files listed in your prompt. Scan for patterns described above.

4. **Correlate transcripts with comments** -- For each reviewer comment, trace back to what the agent did and why. Ask: What in the agent's context or instructions caused this behavior?

5. **Produce recommendations** -- Fill all 5 categories below.

6. **For CLAUDE.md and skill recommendations** -- If you recommend adding a rule to CLAUDE.md or creating a new skill, actually make the file changes and commit them. For new skills: use the `skill-creator` skill if it is available in your current environment. If no skill-creation tool is installed, note this in your recommendation and suggest the user install `anthropic/skills/skill-creator`.

7. **Submit insights** -- Use the CLI command to save your findings.

## Output Categories

### 1. CLAUDE.md Recommendations

Specific rules or instructions to add to the project's CLAUDE.md file. These should be concrete and actionable.

Examples:
- "Add rule: Always run tests before committing"
- "Add rule: Never add error handling to internal functions unless the function crosses a system boundary"
- "Add convention: Use `vi.fn()` for mocks, not manual stub objects"

Check both the project-level `CLAUDE.md` and global `~/.claude/CLAUDE.md` to avoid duplicating existing rules.

### 2. Skill Recommendations

New skills to create or existing skills to modify. Skills encode reusable methodology.

Examples:
- "Create a testing skill that enforces the project's test patterns"
- "The submit-pr skill should include a step to verify all tests pass"

### 3. Prompt & Context Engineering

Coaching for the human on how they interact with agents. This is about the human's behavior, not the agent's.

Examples:
- "Your initial prompt was 12 words -- the agent spent 40% of tokens exploring to figure out what you wanted. Include acceptance criteria next time."
- "You didn't respond to the agent's clarifying question, so it guessed wrong."
- "The task description referenced 'the usual pattern' but the agent has no memory of previous sessions."

### 4. Agent Behavior Observations

What the agent did wrong and why. Factual observations about agent behavior, correlated with transcript evidence.

Examples:
- "Agent explored the codebase for 40% of the session instead of starting work"
- "Agent added unnecessary error handling in 4 files (lines X, Y, Z)"
- "Agent created 3 helper functions that are only used once"
- "Agent didn't read the existing test file before writing new tests, resulting in inconsistent patterns"

### 5. Recurring Pattern Alerts

Cross-PR trends detected from comment history. Reference specific PRs where the pattern appeared.

Examples:
- "3rd time reviewer flagged unnecessary error handling (PRs: abc, def, ghi)"
- "Reviewer has requested snake_case naming in 2 previous PRs"
- "Agent consistently over-engineers validation logic"

## Output Format

Submit via CLI:
```bash
echo '<json>' | shepherd insights update <pr-id> --stdin
```

JSON structure:
```json
{
  "categories": {
    "claudeMdRecommendations": [
      { "title": "Short title", "description": "Detailed explanation", "applied": false }
    ],
    "skillRecommendations": [
      { "title": "Short title", "description": "Detailed explanation", "applied": false }
    ],
    "promptEngineering": [
      { "title": "Short title", "description": "Detailed explanation" }
    ],
    "agentBehaviorObservations": [
      { "title": "Short title", "description": "Detailed explanation" }
    ],
    "recurringPatterns": [
      { "title": "Short title", "description": "Detailed explanation", "prIds": ["pr-id-1", "pr-id-2"] }
    ]
  }
}
```

Set `"applied": true` for recommendations where you've already made the file changes (e.g., added a CLAUDE.md rule or created a skill).

## Principles

- **Be specific** -- "Add error handling" is useless. "The agent added try/catch blocks around internal database calls in 4 files, but these functions are only called internally and errors should propagate" is actionable.
- **Cite evidence** -- Reference specific transcript lines, file paths, or comment text.
- **Work additively** -- Read existing insights and build on them. Don't replace previous findings unless they're wrong.
- **Focus on systemic fixes** -- A CLAUDE.md rule that prevents a class of errors is worth more than fixing one instance.
- **Respect the human** -- Prompt engineering recommendations are coaching, not criticism. Frame them constructively.
