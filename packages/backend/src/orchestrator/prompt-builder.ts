interface ReviewComment {
  id: string;
  filePath: string | null;
  startLine: number | null;
  endLine: number | null;
  body: string;
  severity: string;
  thread: Array<{ author: string; body: string }>;
}

interface PromptInput {
  prId: string;
  prTitle: string;
  agentContext: string | null;
  comments: ReviewComment[];
}

export function buildReviewPrompt(input: PromptInput): string {
  const { prId, prTitle, agentContext, comments } = input;
  const sections: string[] = [];

  sections.push(`# Code Review Feedback for PR: ${prTitle}\n`);

  sections.push(`## IMPORTANT: Read This First

Everything you need is in this prompt. All review comments, context, and instructions are provided below.

You are a peer of the person providing this feedback. You are equals -- it is appropriate to push back on suggestions you disagree with, ask clarifying questions, or propose alternative approaches. Use your technical judgment.

DO NOT:
- Query the API or curl any endpoints
- Access the database directly (sqlite3, etc.)
- Start or restart any servers
- Explore the codebase to "understand" the review system
- Dispatch sub-agents to research the review infrastructure

DO:
1. Read the comments below
2. Make the requested code changes in the project files
3. Commit your changes
4. Write a review-response.json with your replies
5. Submit via \`agent-shepherd ready ${prId} --file review-response.json\`

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

  sections.push(`# Skill: Respond to PR Review Comments

## When to Use

Use this skill when the human reviewer has requested changes on your PR. The orchestrator will provide you with the review comments grouped by file, each tagged with a severity level. Your job is to address every comment: either make the requested change or reply with a reasoned explanation for why you are not making it.

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

### 1. Read and Categorize All Comments

When you receive review comments, organize them mentally:

- **must-fix items:** Handle these first. These are non-negotiable.
- **request items:** Handle next. Plan to comply unless you have a concrete reason not to.
- **suggestion items:** Handle last. Evaluate each on its merits.

### 2. Make Code Changes

Address the comments that require code changes. Work through them file by file to avoid conflicting edits. After making changes:

\`\`\`bash
# Stage and commit the review changes
git add <changed-files...>
git commit -m "Address review feedback: fix null check, refactor error handling"
\`\`\`

### 3. Prepare Batch Response

Write a JSON file with all your replies and any new comments. This is more efficient than individual \`agent-shepherd reply\` calls.

Create a file (e.g., \`review-response.json\`):

\`\`\`json
{
  "comments": [],
  "replies": [
    {
      "parentCommentId": "comment-uuid-1",
      "body": "Fixed. Added the null check before accessing \`user.email\`."
    },
    {
      "parentCommentId": "comment-uuid-2",
      "body": "Done. Refactored to use a try/catch block as suggested."
    },
    {
      "parentCommentId": "comment-uuid-3",
      "body": "I'd push back here. The async version is needed because loadConfig() reads from disk. Blocking the event loop during startup would delay server readiness by ~200ms. I've added a code comment explaining this."
    },
    {
      "parentCommentId": "comment-uuid-4",
      "body": "Good suggestion. Renamed the variable to \`activeConnections\`."
    }
  ]
}
\`\`\`

The \`comments\` array is for new comments you want to leave on the code (e.g., to flag something for the reviewer's attention). Each comment needs \`filePath\`, \`startLine\`, \`endLine\`, \`body\`, and \`severity\`.

The \`replies\` array is for responding to existing review comments. Each reply needs \`parentCommentId\` and \`body\`.

### 4. Submit Replies and Signal Ready

Use \`agent-shepherd ready\` with the \`--file\` flag to submit your batch response and signal that the PR is ready for re-review in a single command:

\`\`\`bash
agent-shepherd ready <pr-id> --file review-response.json
\`\`\`

This does two things:
1. Submits all comments and replies from the JSON file
2. Signals to the reviewer that you are done and the PR is ready for another look

Alternatively, you can submit the batch separately and then signal ready:

\`\`\`bash
# Submit batch first
agent-shepherd batch <pr-id> --file review-response.json

# Then signal ready
agent-shepherd ready <pr-id>
\`\`\`

Or pipe JSON directly via stdin:

\`\`\`bash
echo '{"replies":[{"parentCommentId":"abc","body":"Fixed."}]}' | agent-shepherd batch <pr-id> --stdin
agent-shepherd ready <pr-id>
\`\`\`

### 5. Verify Status

\`\`\`bash
agent-shepherd status <pr-id>
\`\`\`

Confirm the PR shows the next cycle number and the status reflects that it is awaiting review.

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
5. **Forgetting to call \`agent-shepherd ready\`.** Without this signal, the reviewer is not notified that you are done. The PR will sit in \`agent_working\` status indefinitely.
`);

  // Group comments into three buckets: global, file-level, line-level
  const globalComments: ReviewComment[] = [];
  const fileComments = new Map<string, ReviewComment[]>();
  const lineComments = new Map<string, ReviewComment[]>();

  for (const c of comments) {
    if (!c.filePath) {
      globalComments.push(c);
    } else if (c.startLine == null) {
      const existing = fileComments.get(c.filePath) || [];
      existing.push(c);
      fileComments.set(c.filePath, existing);
    } else {
      const existing = lineComments.get(c.filePath) || [];
      existing.push(c);
      lineComments.set(c.filePath, existing);
    }
  }

  const formatThread = (c: ReviewComment): string => {
    const lines: string[] = [];
    if (c.thread.length > 0) {
      lines.push(`Thread:`);
      for (const reply of c.thread) {
        lines.push(`  - ${reply.author}: ${reply.body}`);
      }
      lines.push('');
    }
    return lines.join('\n');
  };

  if (comments.length > 0) {
    sections.push(`\n## Comments\n`);

    // Global comments
    if (globalComments.length > 0) {
      sections.push(`### General Comments\n`);
      for (const c of globalComments) {
        const sevLabel = c.severity === 'must-fix' ? 'MUST FIX' : c.severity.toUpperCase();
        sections.push(`**[${sevLabel}]** (comment ID: ${c.id})`);
        sections.push(`> ${c.body}\n`);
        const thread = formatThread(c);
        if (thread) sections.push(thread);
      }
    }

    // File-level and line-level comments grouped by file
    const allFiles = new Set([...fileComments.keys(), ...lineComments.keys()]);
    for (const filePath of allFiles) {
      sections.push(`### ${filePath}\n`);

      // File-level comments first
      const fileLevelComments = fileComments.get(filePath) || [];
      for (const c of fileLevelComments) {
        const sevLabel = c.severity === 'must-fix' ? 'MUST FIX' : c.severity.toUpperCase();
        sections.push(`**[${sevLabel}]** (file comment, ID: ${c.id})`);
        sections.push(`> ${c.body}\n`);
        const thread = formatThread(c);
        if (thread) sections.push(thread);
      }

      // Line-level comments
      const lineLevelComments = lineComments.get(filePath) || [];
      for (const c of lineLevelComments) {
        const sevLabel = c.severity === 'must-fix' ? 'MUST FIX' : c.severity.toUpperCase();
        const lineRange = c.startLine === c.endLine ? `L${c.startLine}` : `L${c.startLine}-${c.endLine}`;
        sections.push(`**[${sevLabel}]** ${lineRange} (comment ID: ${c.id})`);
        sections.push(`> ${c.body}\n`);
        const thread = formatThread(c);
        if (thread) sections.push(thread);
      }
    }
  }

  return sections.join('\n');
}
