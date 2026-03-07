interface InsightsPromptInput {
  prId: string;
  prTitle: string;
  branch: string;
  projectId: string;
  transcriptPaths: string[];
  previousUpdatedAt?: string;
}

export function buildInsightsPrompt(input: InsightsPromptInput): string {
  const { prId, prTitle, branch, projectId, transcriptPaths } = input;
  const sections: string[] = [];

  sections.push(`# Workflow Insights Analysis for PR: ${prTitle}\n`);

  sections.push(`## PR Details

- PR ID: ${prId}
- Branch: ${branch}
- Project ID: ${projectId}
`);

  if (transcriptPaths.length > 0) {
    sections.push(`## Session Transcripts

${transcriptPaths.map((p, i) => `${i + 1}. ${p}`).join('\n')}
`);
  } else {
    sections.push(`## Session Transcripts

No session logs found for this branch. Focus analysis on the comment history.
`);
  }

  if (input.previousUpdatedAt) {
    sections.push(`## Incremental Analysis

Your previous analysis was saved at ${input.previousUpdatedAt}. This is a follow-up run.

- Run \`git log --since="${input.previousUpdatedAt}" --oneline\` to see commits made since your last analysis. Focus on sessions that produced these new commits.
- Review your previous findings via \`insights get\`. Do not re-report existing recommendations.
- Comments from review cycles prior to ${input.previousUpdatedAt} have already been factored into your existing recommendations. Do not count them as additional evidence for a pattern. You may reference them for context when analyzing newer comments, but they should not inflate confidence or cause duplicate findings.
- If a previous finding is now better supported by additional evidence, update its confidence level or description rather than creating a duplicate.
- If no meaningful new patterns emerge, return your existing insights unchanged.
`);
  }

  sections.push(`## Available CLI Commands

- \`agent-shepherd insights get ${prId}\` — Read current insights (call this first to work additively)
- \`agent-shepherd insights update ${prId} --stdin\` — Save/update your insights
- \`agent-shepherd insights history ${projectId}\` — Get all comments across PRs for pattern detection

## Your Task

Use the \`agent-shepherd:workflow-analyzer\` skill to analyze the agent's session transcripts and comment history. The skill contains the full methodology, output categories, confidence levels, and JSON format.
`);

  return sections.join('\n');
}
