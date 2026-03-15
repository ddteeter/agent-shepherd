---
name: agent-shepherd:workflow-analyzer
description: Analyze agent session transcripts and review comment history to produce workflow improvement recommendations. Use when spawned by Agent Shepherd's insights analyzer to examine why an agent produced suboptimal output and how to prevent it.
---

# Skill: Workflow Analyzer

You are analyzing an AI coding agent's work to produce workflow improvement recommendations. Your goal is to close the feedback loop -- not just on the code, but on the agent's behavior and the human's setup.

## Data Sources

### 1. Session Transcripts (formatted markdown)

Read the formatted transcript files provided in your prompt. These are readable markdown files pre-processed from raw JSONL session logs. Each file includes:

- **YAML frontmatter** with `source` (original JSONL path), `session_id`, `branch`, and `started_at`
- **`## Assistant [line N]`** sections containing the agent's full reasoning text and tool call summaries (tool name + key params, with large content values summarized by size)
- **`## User [line N]`** sections containing human prompts and tool result previews (first ~200 chars + total size)
- **`[line N]` annotations** referencing source line numbers in the original JSONL for traceability

If you need to see a specific file's actual contents, read the file directly from the repo rather than trying to extract it from the transcript.

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

1. **Read existing insights** -- Call `agent-shepherd insights get <pr-id>` first. If insights already exist, build on them rather than replacing them.

2. **Fetch comment history** -- Call the `insights history` command from your prompt (it includes the `--pr` flag). The response is grouped:
   - `currentPr.comments` — comments on this PR. Use these for categories 1-4 (CLAUDE.md, skills, prompt engineering, agent behavior). If `currentPr` is absent, there are no reviewer comments on this PR yet — skip categories 1-4 comment analysis.
   - `otherPrs[].comments` — comments on other PRs in this project. Use these ONLY for category 5 (Recurring Pattern Alerts).

3. **Read session transcripts** -- Read the JSONL files listed in your prompt. Scan for patterns described above.

4. **Correlate transcripts with comments** -- For each comment in `currentPr.comments`, trace back to what the agent did and why. Ask: What in the agent's context or instructions caused this behavior? Only correlate session transcripts with comments from `currentPr`. Never attribute comments from `otherPrs` to the current PR's agent session.

5. **Produce recommendations** -- Fill all 5 categories below, placing each insight in exactly one category per the Placement Priority rules.

6. **Deduplicate across categories** -- Review all recommendations across all 5 categories. For each insight, check whether the same conceptual problem appears in another category. If it does: keep the instance in the highest-priority category (per the Placement Priority rule), remove it from all other categories, and fold any unique context from the removed instances into the kept instance's description.

7. **For CLAUDE.md and skill recommendations** -- For CLAUDE.md and skill recommendations with `high` confidence, actually make the file changes and commit them. For `medium` and `low` confidence, describe the recommendation but do not make file changes. For new skills: use the `skill-creator` skill if it is available in your current environment. If no skill-creation tool is installed, note this in your recommendation and suggest the user install `anthropic/skills/skill-creator`.

8. **Submit insights** -- Use the CLI command to save your findings.

## Output Categories

### 1. CLAUDE.md Recommendations

Specific rules or instructions to add to the project's CLAUDE.md file. These should be concrete and actionable.

Examples:

- "Add rule: Always run tests before committing"
- "Add rule: Never add error handling to internal functions unless the function crosses a system boundary"
- "Add convention: Use `vi.fn()` for mocks, not manual stub objects"

Check both the project-level `CLAUDE.md` and global `~/.claude/CLAUDE.md` to avoid duplicating existing rules.

#### CLAUDE.md Best Practices

<!-- Source: https://code.claude.com/docs/en/memory#claudemd-files -->
<!-- Last reviewed: 2026-03-07 -->

When recommending CLAUDE.md additions, choose the right location:

| Situation                 | Location                                          | Example                     |
| ------------------------- | ------------------------------------------------- | --------------------------- |
| Simple universal rule     | Add directly to `CLAUDE.md`                       | "Use 2-space indentation"   |
| Detailed topic guide      | Create file + `@path/to/file` import in CLAUDE.md | API design patterns doc     |
| Rule scoped to file types | `.claude/rules/name.md` with `paths` frontmatter  | Rules for `src/api/**/*.ts` |

Key principles:

- Keep CLAUDE.md under 200 lines. Move details to separate files via `@imports` or `.claude/rules/`.
- Be specific and concrete — verifiable instructions, not vague guidance.
- Avoid conflicting instructions across files. Check existing CLAUDE.md and rules before adding.
- Use `paths` frontmatter in `.claude/rules/` files to scope rules to specific glob patterns.
- Think of CLAUDE.md as a "lookup matrix" — an index pointing agents to the right context for a given situation, not a dumping ground for all instructions.

Example `.claude/rules/` file with path scoping:

```yaml
---
paths:
  - 'src/api/**/*.ts'
---
# API Rules
- All endpoints must validate input
- Use standard error response format
```

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

What the agent did wrong, why, and how to fix it. Only report behaviors that need to change — do not note things the agent handled correctly. Every observation MUST include a concrete recommendation for improvement -- don't just describe the problem, prescribe the solution.

Examples:

- "Agent explored the codebase for 40% of the session instead of starting work. Recommendation: Add a CLAUDE.md rule to start implementation within the first 3 tool calls for well-scoped tasks, or add acceptance criteria to the prompt so the agent doesn't need to explore."
- "Agent added unnecessary error handling in 4 files (lines X, Y, Z). Recommendation: Add a CLAUDE.md rule: 'Only add try/catch at system boundaries (API handlers, CLI entry points). Internal functions should let errors propagate.'"
- "Agent created 3 helper functions that are only used once. Recommendation: Add a CLAUDE.md rule against premature abstraction, or reference the existing 'avoid over-engineering' instruction more prominently."
- "Agent didn't read the existing test file before writing new tests, resulting in inconsistent patterns. Recommendation: Add a CLAUDE.md rule: 'Before writing tests, read existing test files in the same directory to match conventions.'"

### 5. Recurring Pattern Alerts

Cross-PR trends detected from comment history. Reference specific PRs where the pattern appeared.

Examples:

- "3rd time reviewer flagged unnecessary error handling (PRs: abc, def, ghi)"
- "Reviewer has requested snake_case naming in 2 previous PRs"
- "Agent consistently over-engineers validation logic"

## Placement Priority

Each insight goes in exactly ONE category. When an insight could fit multiple categories, walk this priority list top-to-bottom and place it in the first category where it fits **with confidence that the fix is correct**:

1. **CLAUDE.md Recommendations** — the fix is a concrete rule that would prevent the issue, and you're confident the rule is right
2. **Skill Recommendations** — the fix is a new or modified skill, and you're confident the change is correct
3. **Prompt & Context Engineering** — the root cause is the human's input or context, not the agent's behavior
4. **Recurring Pattern Alerts** — this is a cross-PR trend (evidence from 2+ PRs) without a clear single-category fix yet
5. **Agent Behavior Observations** — the issue doesn't yet have a confident actionable fix; use this as a holding category until evidence supports a concrete recommendation

If you're unsure a CLAUDE.md rule or skill change would actually help, the insight belongs in Agent Behavior Observations — not in the actionable category. Prefer observations over speculative fixes.

## Confidence Levels

Every recommendation MUST include a `confidence` field:

- **high** — Clear, repeated pattern with strong transcript evidence. The fix is well-scoped and low-risk. **Action: auto-commit file changes** for CLAUDE.md and skill recommendations.
- **medium** — Likely a real issue with a reasonable fix, but evidence is limited or the fix could have side effects. **Action: recommend only, do NOT commit file changes.**
- **low** — Possible pattern worth considering, but could be a one-off or context-dependent. **Action: recommend only, mark as speculative.**

For CLAUDE.md and skill recommendations: only commit file changes when confidence is `high`. For `medium` and `low`, describe the recommendation but leave implementation to the user.

## Output Format

Submit via CLI using this three-step pattern. Direct piping (heredocs, `echo` with JSON, input redirection) is blocked by Claude Code's sandbox because JSON braces with quotes trigger expansion obfuscation detection.

1. Use the `Write` tool to save your JSON to a temp file in the project directory:
   - File name: `tmp-insights.json`
2. Pipe the file to the CLI:
   ```bash
   cat tmp-insights.json | agent-shepherd insights update <pr-id> --stdin
   ```
3. Clean up the temp file:
   ```bash
   rm tmp-insights.json
   ```

JSON structure:

```json
{
  "categories": {
    "claudeMdRecommendations": [
      {
        "title": "Short title",
        "description": "Detailed explanation",
        "confidence": "high",
        "appliedPath": "CLAUDE.md"
      }
    ],
    "skillRecommendations": [
      {
        "title": "Short title",
        "description": "Detailed explanation",
        "confidence": "medium"
      }
    ],
    "promptEngineering": [
      {
        "title": "Short title",
        "description": "Detailed explanation",
        "confidence": "high"
      }
    ],
    "agentBehaviorObservations": [
      {
        "title": "Short title",
        "description": "Detailed explanation",
        "confidence": "medium"
      }
    ],
    "recurringPatterns": [
      {
        "title": "Short title",
        "description": "Detailed explanation",
        "confidence": "high",
        "prIds": ["pr-id-1"]
      }
    ]
  }
}
```

Set `appliedPath` to the file path you modified (e.g., `"CLAUDE.md"`, `".claude/rules/api-rules.md"`) when you've committed changes. Omit `appliedPath` for recommendations you haven't implemented.

## Principles

- **Only report problems and improvements** -- Do not note what the agent did well. Positive observations are noise. If the agent handled something correctly, there is nothing to report.
- **Empty categories are expected** -- If a category has no findings, return an empty array. Do not invent recommendations to fill every category. A run with few or no findings is a good outcome.
- **Every insight must be actionable** -- Don't just observe problems, recommend solutions. If you can't suggest a concrete improvement, the observation isn't worth reporting. Every item across all categories must answer: "What should change to prevent this?"
- **Be specific** -- "Add error handling" is useless. "The agent added try/catch blocks around internal database calls in 4 files, but these functions are only called internally and errors should propagate" is actionable.
- **Cite evidence** -- Reference specific transcript lines, file paths, or comment text.
- **Work additively** -- Read existing insights and build on them. Don't replace previous findings unless they're wrong.
- **Focus on systemic fixes** -- A CLAUDE.md rule that prevents a class of errors is worth more than fixing one instance.
- **Respect the human** -- Prompt engineering recommendations are coaching, not criticism. Frame them constructively.
