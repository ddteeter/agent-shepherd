interface ReviewComment {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  body: string;
  severity: string;
  thread: Array<{ author: string; body: string }>;
}

interface PromptInput {
  prTitle: string;
  agentContext: string | null;
  comments: ReviewComment[];
  customPrompt?: string;
}

export function buildReviewPrompt(input: PromptInput): string {
  const { prTitle, agentContext, comments, customPrompt } = input;
  const sections: string[] = [];

  sections.push(`# Code Review Feedback for PR: ${prTitle}\n`);

  if (agentContext) {
    try {
      const ctx = JSON.parse(agentContext);
      sections.push(`## Context\n${JSON.stringify(ctx, null, 2)}\n`);
    } catch {
      sections.push(`## Context\n${agentContext}\n`);
    }
  }

  sections.push(`## Review Guidelines\n`);
  if (customPrompt) {
    sections.push(customPrompt);
  } else {
    sections.push(`- **MUST FIX** comments: Make the change. No discussion needed.
- **REQUEST** comments: Make the change unless you have a strong technical reason not to. If you disagree, explain why in a reply.
- **SUGGESTION** comments: Use your judgment. Fix if you agree, or reply with your reasoning if you disagree.

For each comment, either:
1. Make the code change and reply confirming what you changed
2. Reply explaining why you disagree (only for suggestion/request severity)

Use the shepherd CLI to submit your responses as a batch.`);
  }

  // Group comments by file
  const byFile = new Map<string, ReviewComment[]>();
  for (const c of comments) {
    const existing = byFile.get(c.filePath) || [];
    existing.push(c);
    byFile.set(c.filePath, existing);
  }

  if (comments.length > 0) {
    sections.push(`\n## Comments\n`);
    for (const [filePath, fileComments] of byFile) {
      sections.push(`### ${filePath}\n`);
      for (const c of fileComments) {
        const sevLabel = c.severity === 'must-fix' ? 'MUST FIX' : c.severity.toUpperCase();
        const lineRange = c.startLine === c.endLine ? `L${c.startLine}` : `L${c.startLine}-${c.endLine}`;
        sections.push(`**[${sevLabel}]** ${lineRange} (comment ID: ${c.id})`);
        sections.push(`> ${c.body}\n`);

        if (c.thread.length > 0) {
          sections.push(`Thread:`);
          for (const reply of c.thread) {
            sections.push(`  - ${reply.author}: ${reply.body}`);
          }
          sections.push('');
        }
      }
    }
  }

  return sections.join('\n');
}
