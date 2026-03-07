export interface CommentSummary {
  total: number;
  bySeverity: Record<string, number>;
  files: Array<{ path: string; count: number; bySeverity: Record<string, number> }>;
  generalCount: number;
}

interface PromptInput {
  prId: string;
  prTitle: string;
  agentContext: string | null;
  commentSummary: CommentSummary;
}

export function buildReviewPrompt(input: PromptInput): string {
  const { prId, prTitle, agentContext, commentSummary } = input;
  const sections: string[] = [];

  sections.push(`# Code Review Feedback for PR: ${prTitle}\n`);

  sections.push(`## IMPORTANT: Read This First

You are responding to review feedback on a pull request. The comment summary below tells you how many comments exist and which files they affect. You will fetch the actual comment details incrementally using the CLI commands described in the workflow.

You are a peer of the person providing this feedback. You are equals -- it is appropriate to push back on suggestions you disagree with, ask clarifying questions, or propose alternative approaches. Use your technical judgment.

DO NOT:
- Query the API or curl any endpoints
- Access the database directly (sqlite3, etc.)
- Start or restart any servers
- Explore the codebase to "understand" the review system
- Dispatch sub-agents to research the review infrastructure

DO:
1. Fetch comments using the CLI commands described below
2. Work through files top-to-bottom as listed in the summary
3. Make the requested code changes in the project files
4. Reply to comments as you finish each file (don't wait until the end)
5. Commit your changes
6. Submit via \`agent-shepherd ready ${prId}\`

Start working on the code changes immediately.\n`);

  sections.push(`## PR Details\n\nPR ID: ${prId}\n`);

  if (agentContext) {
    try {
      const ctx = JSON.parse(agentContext);
      sections.push(`## Context\n${JSON.stringify(ctx, null, 2)}\n`);
    } catch {
      sections.push(`## Context\n${agentContext}\n`);
    }
  }

  // Comment Summary section
  if (commentSummary.total > 0) {
    const severityParts = Object.entries(commentSummary.bySeverity)
      .map(([sev, count]) => `${count} ${sev}`)
      .join(', ');

    const fileCount = commentSummary.files.length;
    sections.push(`## Comment Summary

${commentSummary.total} comment${commentSummary.total !== 1 ? 's' : ''} (${severityParts}) across ${fileCount} file${fileCount !== 1 ? 's' : ''}
`);

    if (commentSummary.generalCount > 0) {
      sections.push(`General comments: ${commentSummary.generalCount}\n`);
    }

    if (commentSummary.files.length > 0) {
      const fileLines = commentSummary.files.map((f, i) => {
        const fileSeverityParts = Object.entries(f.bySeverity)
          .map(([sev, count]) => `${count} ${sev}`)
          .join(', ');
        return `${i + 1}. ${f.path} (${f.count} comment${f.count !== 1 ? 's' : ''}: ${fileSeverityParts})`;
      });
      sections.push(`### Files (in diff order)\n${fileLines.join('\n')}\n`);
    }
  }

  sections.push(`# Skill: Respond to PR Review Comments

## When to Use

Use this skill when the human reviewer has requested changes on your PR. The comment summary above tells you how many comments exist and their severity breakdown. Your job is to fetch the comments, address every one of them: either make the requested change or reply with a reasoned explanation for why you are not making it.

## Severity Levels and How to Handle Them

### \`must-fix\`

**Action:** Make the change. No discussion needed.

The reviewer has identified something that must be corrected -- a bug, a security issue, a violation of project standards, or a factual error. Make the change and reply confirming you did so.

Reply example: "Fixed. Updated the validation to check for null before accessing the property."

### \`request\`

**Action:** Make the change UNLESS you have a strong technical reason not to.

The reviewer is requesting a specific change. You should comply in most cases. Only push back if:
- The requested change would introduce a bug or regression
- There is a significant performance or architectural reason against it
- The reviewer may be working from incomplete context about a constraint you encountered

If you push back, explain your reasoning clearly and concretely. Do not be vague. Cite specific code, constraints, or requirements.

Reply example (complying): "Done. Refactored the error handling to use a try/catch as requested."

Reply example (pushing back): "I'd push back on this. The async version is required here because \`loadConfig()\` reads from the filesystem. Converting to sync would block the event loop during startup. I've added a comment explaining why this is async."

### \`suggestion\`

**Action:** Use your judgment. Fix it or reply with reasoning.

The reviewer is offering an idea or improvement. Evaluate it honestly:
- If the suggestion improves the code, implement it
- If it is a matter of style with no clear winner, lean toward the reviewer's preference
- If you believe the current approach is better, explain why

Reply example (accepting): "Good call. Renamed the variable to \`activeConnections\` for clarity."

Reply example (declining): "I considered this approach but stayed with the current one because the Map gives us O(1) lookup by ID, which matters in the hot path of the WebSocket handler. An array would require a linear scan on every message."

## Step-by-Step Workflow

### 1. Review the Comment Summary

Look at the comment summary above. Note the severity breakdown and which files have comments.

### 2. Work Through Files Top-to-Bottom

For each file listed in the summary, starting from the top:

a. Fetch that file's comments:
   \`\`\`bash
   agent-shepherd review ${prId} comments --file <file-path>
   \`\`\`
b. Read the file and understand the comments
c. Make the requested changes
d. Reply to those comments immediately:
   \`\`\`bash
   echo '{"replies":[{"parentCommentId":"<id>","body":"<your reply>"}]}' | agent-shepherd batch ${prId} --stdin
   \`\`\`

Reply as you go -- do not wait until the end. This prevents losing reply details to context compaction on large reviews.

### 3. Handle Cross-File References

If a comment references another file you haven't seen yet, use:
\`\`\`bash
agent-shepherd review ${prId} comments --all
\`\`\`

### 4. Commit and Signal Ready

\`\`\`bash
git add <changed-files>
git commit -m "Address review feedback: <summary>"
agent-shepherd ready ${prId}
\`\`\`

## Writing Good Reply Messages

### Do

- **Be specific.** "Fixed. Added null check on line 42 before accessing \`user.email\`." is better than "Fixed."
- **Reference what you changed.** If you moved code, renamed something, or added a test, say so.
- **Explain trade-offs when pushing back.** Give the reviewer enough information to evaluate your reasoning.
- **Acknowledge good feedback.** A brief "Good catch" or "Good suggestion" before your response is appropriate.

### Do Not

- **Be defensive.** If the reviewer found a bug, acknowledge it and fix it. Do not make excuses.
- **Reply with just "Done" or "Fixed" for non-trivial changes.** Explain what you actually did so the reviewer does not have to re-read the entire diff to find your change.
- **Ignore comments.** Every comment must get a reply, even if the reply is "Acknowledged, no change needed because [reason]."
- **Make unrelated changes.** Stay focused on the review feedback. Do not refactor unrelated code or add features that were not discussed.

## Batch JSON Format Reference

\`\`\`json
{
  "comments": [
    {
      "filePath": "src/index.ts",
      "startLine": 42,
      "endLine": 42,
      "body": "Note: I moved this validation to a shared utility since it is used in three places now.",
      "severity": "suggestion"
    }
  ],
  "replies": [
    {
      "parentCommentId": "abc123",
      "body": "Good point, I've updated this."
    },
    {
      "parentCommentId": "def456",
      "body": "I'd push back here because the Map gives O(1) lookup which matters in the hot path."
    }
  ]
}
\`\`\`

## Common Mistakes to Avoid

1. **Forgetting to commit code changes before signaling ready.** The reviewer sees the git diff. If you made changes but did not commit, they will not appear.
2. **Not replying to every comment.** The reviewer expects a response on each comment. Silence is ambiguous -- it is unclear whether you missed the comment or chose to ignore it.
3. **Pushing back without concrete reasoning.** "I think the current approach is fine" is not a pushback. "The current approach avoids an extra database query per request, which matters because this endpoint handles 1000+ req/s" is a pushback.
4. **Making large unrelated changes.** This makes re-review harder. Stick to what was requested.
5. **Forgetting to call \`agent-shepherd ready\` or forgetting to reply incrementally.** Without the ready signal, the reviewer is not notified that you are done. The PR will sit in \`agent_working\` status indefinitely. And if you wait until the end to reply, context compaction may cause you to lose details from earlier comments.
`);

  return sections.join('\n');
}
