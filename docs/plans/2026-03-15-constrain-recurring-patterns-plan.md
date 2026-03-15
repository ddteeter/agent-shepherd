# Constrain Recurring Pattern Alerts Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the workflow analyzer skill so Recurring Pattern Alerts only fire when anchored to a comment on the current PR.

**Architecture:** Three edits to `skills/agent-shepherd-workflow-analyzer/SKILL.md` — expand the no-comments gate, rewrite category 6 description/examples, and update the Placement Priority bullet.

**Tech Stack:** Markdown (skill file only)

**Spec:** `docs/plans/2026-03-15-constrain-recurring-patterns-design.md`

---

## Chunk 1: Skill File Edits

### Task 1: Expand the no-comments gate in Analysis Workflow step 2

**Files:**

- Modify: `skills/agent-shepherd-workflow-analyzer/SKILL.md:42-44`

- [ ] **Step 1: Update the step 2 comment history instructions**

Replace lines 42-44:

```markdown
2. **Fetch comment history** -- Call the `insights history` command from your prompt (it includes the `--pr` flag). The response is grouped:
   - `currentPr.comments` — comments on this PR. Use these for categories 1-5 (tools, CLAUDE.md, skills, prompt engineering, agent behavior). If `currentPr` is absent, there are no reviewer comments on this PR yet — skip categories 1-5 comment analysis.
   - `otherPrs[].comments` — comments on other PRs in this project. Use these ONLY for category 6 (Recurring Pattern Alerts).
```

With:

```markdown
2. **Fetch comment history** -- Call the `insights history` command from your prompt (it includes the `--pr` flag). The response is grouped:
   - `currentPr.comments` — comments on this PR. Use these for categories 1-5 (tools, CLAUDE.md, skills, prompt engineering, agent behavior).
   - `otherPrs[].comments` — comments on other PRs in this project. Use these ONLY for category 6 (Recurring Pattern Alerts), and only to check whether a `currentPr` comment echoes a concern from a past PR.
   - **If `currentPr` is absent or has zero comments, skip ALL comment-based analysis (categories 1-6).** Do not read or analyze `otherPrs` data — there is nothing on the current PR to anchor against. Previous insight runs on those PRs already surfaced any historical patterns.
```

- [ ] **Step 2: Verify the edit reads correctly**

Read lines 42-46 of the file and confirm the new text is in place.

- [ ] **Step 3: Commit**

```bash
git add skills/agent-shepherd-workflow-analyzer/SKILL.md
git commit -m "fix(skill): gate all comment analysis on currentPr having comments (#26)"
```

---

### Task 2: Rewrite category 6 description and examples

**Files:**

- Modify: `skills/agent-shepherd-workflow-analyzer/SKILL.md:159-167`

- [ ] **Step 1: Replace the category 6 section**

Replace lines 159-167:

```markdown
### 6. Recurring Pattern Alerts

Cross-PR trends detected from comment history. Reference specific PRs where the pattern appeared.

Examples:

- "3rd time reviewer flagged unnecessary error handling (PRs: abc, def, ghi)"
- "Reviewer has requested snake_case naming in 2 previous PRs"
- "Agent consistently over-engineers validation logic"
```

With:

```markdown
### 6. Recurring Pattern Alerts

Cross-PR trends anchored to comments on the current PR. For each comment in `currentPr.comments`, check whether a similar concern appeared in `otherPrs[].comments`. If the same type of feedback appeared on 1+ other PRs, flag it as a recurring pattern. Reference the current PR comment that triggered the match and the specific past PRs where the pattern appeared.

Do NOT independently scan `otherPrs` for standalone trends. Every recurring pattern alert must start from a specific comment on the current PR. If `currentPr` has no comments, this category is always empty.

Examples:

- "Reviewer flagged unnecessary error handling on this PR (comment: 'remove try/catch from internal helpers') — same concern appeared in PRs abc and def"
- "Reviewer requested snake_case naming on this PR — same feedback given in PRs ghi and jkl"
- "Reviewer flagged over-engineered validation on this PR — similar comments in PRs mno and pqr"
```

- [ ] **Step 2: Verify the edit reads correctly**

Read lines 159-173 of the file and confirm the new text is in place.

- [ ] **Step 3: Commit**

```bash
git add skills/agent-shepherd-workflow-analyzer/SKILL.md
git commit -m "fix(skill): require current-PR anchor for recurring pattern alerts (#26)"
```

---

### Task 3: Update Placement Priority for Recurring Pattern Alerts

**Files:**

- Modify: `skills/agent-shepherd-workflow-analyzer/SKILL.md:177`

- [ ] **Step 1: Replace the Placement Priority bullet**

Replace line 177:

```markdown
5. **Recurring Pattern Alerts** — this is a cross-PR trend (evidence from 2+ PRs) without a clear single-category fix yet
```

With:

```markdown
5. **Recurring Pattern Alerts** — a comment on the current PR echoes a concern from 1+ other PRs, confirming a cross-PR trend without a clear single-category fix yet
```

- [ ] **Step 2: Verify the edit reads correctly**

Read lines 169-180 of the file and confirm the Placement Priority section is consistent.

- [ ] **Step 3: Commit**

```bash
git add skills/agent-shepherd-workflow-analyzer/SKILL.md
git commit -m "fix(skill): update placement priority to require current-PR anchor (#26)"
```
