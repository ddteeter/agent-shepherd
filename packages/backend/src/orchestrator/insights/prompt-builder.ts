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

The following session transcript files are available for analysis. Read them to understand what the agent did and why.

${sessionLogPaths.map((p, i) => `${i + 1}. ${p}`).join('\n')}
`);
  } else {
    sections.push(`## Session Logs

No session logs found for this branch. Focus analysis on the comment history.
`);
  }

  sections.push(`## Available CLI Commands

- \`shepherd insights get ${prId}\` — Read current insights (call this first to work additively)
- \`shepherd insights update ${prId} --stdin\` — Save/update your insights
- \`shepherd insights history ${projectId}\` — Get all comments across PRs for pattern detection

## Your Task

Analyze the agent's session transcripts and the project's comment history to produce workflow improvement recommendations. Use the analyzer skill for detailed methodology.

### Output Format

Submit your findings via:
\`\`\`bash
echo '<json>' | shepherd insights update ${prId} --stdin
\`\`\`

The JSON payload must have this structure:
\`\`\`json
{
  "categories": {
    "claudeMdRecommendations": [{"title": "...", "description": "...", "applied": false}],
    "skillRecommendations": [{"title": "...", "description": "...", "applied": false}],
    "promptEngineering": [{"title": "...", "description": "..."}],
    "agentBehaviorObservations": [{"title": "...", "description": "..."}],
    "recurringPatterns": [{"title": "...", "description": "...", "prIds": ["..."]}]
  }
}
\`\`\`

### Workflow

1. Call \`shepherd insights get ${prId}\` to check for existing insights
2. Call \`shepherd insights history ${projectId}\` to get cross-PR comment patterns
3. Read the session log files listed above
4. Analyze the session transcripts, correlating with review comments
5. For CLAUDE.md and skill recommendations, also make the file changes and commit them
6. Submit all insights via the update command
`);

  return sections.join('\n');
}
