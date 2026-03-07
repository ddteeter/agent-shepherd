interface InsightsPromptInput {
  prId: string;
  prTitle: string;
  branch: string;
  projectId: string;
  sessionLogPaths: string[];
}

export function buildInsightsPrompt(input: InsightsPromptInput): string {
  const { prId, prTitle, branch, projectId, sessionLogPaths } = input;
  const sections: string[] = [];

  sections.push(`# Workflow Insights Analysis for PR: ${prTitle}\n`);

  sections.push(`## PR Details

- PR ID: ${prId}
- Branch: ${branch}
- Project ID: ${projectId}
`);

  if (sessionLogPaths.length > 0) {
    sections.push(`## Session Logs

The following session transcript files are available for analysis. These are JSONL files that can be very large. Read them in chunks using the \`offset\` and \`limit\` parameters of the Read tool (e.g., start with \`offset: 1, limit: 500\`, then \`offset: 501, limit: 500\`, etc.). Do NOT attempt to read an entire file at once.

${sessionLogPaths.map((p, i) => `${i + 1}. ${p}`).join('\n')}
`);
  } else {
    sections.push(`## Session Logs

No session logs found for this branch. Focus analysis on the comment history.
`);
  }

  sections.push(`## Available CLI Commands

- \`agent-shepherd insights get ${prId}\` — Read current insights (call this first to work additively)
- \`agent-shepherd insights update ${prId} --stdin\` — Save/update your insights
- \`agent-shepherd insights history ${projectId}\` — Get all comments across PRs for pattern detection

## Your Task

Use the \`workflow-analyzer\` skill to analyze the agent's session transcripts and comment history. The skill contains the full methodology, output categories, and JSON format.

### Important Notes

- For CLAUDE.md and skill recommendations, only make and commit file changes if you are highly confident they are correct.
- The \`insights update\` command replaces all existing insights for this PR. Call \`insights get\` first and include any previous findings you want to keep.
`);

  return sections.join('\n');
}
