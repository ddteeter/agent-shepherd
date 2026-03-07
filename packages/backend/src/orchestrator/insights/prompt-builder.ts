interface InsightsPromptInput {
  prId: string;
  prTitle: string;
  branch: string;
  projectId: string;
  transcriptPaths: string[];
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

The following formatted transcript files are available for analysis. These are readable markdown files with the full agent reasoning and tool call summaries. Each file has YAML frontmatter with the original JSONL path for reference. Entries are annotated with \`[line N]\` source line numbers.

${transcriptPaths.map((p, i) => `${i + 1}. ${p}`).join('\n')}

If you need to see a specific file's contents, read the file directly from the repo rather than trying to extract it from the transcript.
`);
  } else {
    sections.push(`## Session Transcripts

No session logs found for this branch. Focus analysis on the comment history.
`);
  }

  sections.push(`## Available CLI Commands

- \`agent-shepherd insights get ${prId}\` — Read current insights (call this first to work additively)
- \`agent-shepherd insights update ${prId} --stdin\` — Save/update your insights
- \`agent-shepherd insights history ${projectId}\` — Get all comments across PRs for pattern detection

## Your Task

Use the \`agent-shepherd:workflow-analyzer\` skill to analyze the agent's session transcripts and comment history. The skill contains the full methodology, output categories, and JSON format.

### Important Notes

- For CLAUDE.md and skill recommendations, only make and commit file changes if you are highly confident they are correct.
- The \`insights update\` command replaces all existing insights for this PR. Call \`insights get\` first and include any previous findings you want to keep.
`);

  return sections.join('\n');
}
