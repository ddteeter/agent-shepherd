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
  prTitle: string;
  agentContext: string | null;
  comments: ReviewComment[];
  /** Full content of the shepherd-respond-to-review skill, if available */
  skillContent?: string;
}

export function buildReviewPrompt(input: PromptInput): string {
  const { prTitle, agentContext, comments } = input;
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

  if (input.skillContent) {
    sections.push(input.skillContent);
  } else {
    sections.push(`## Review Guidelines\n`);
    sections.push(`- **MUST FIX** comments: Make the change. No discussion needed.
- **REQUEST** comments: Make the change unless you have a strong technical reason not to. If you disagree, explain why in a reply.
- **SUGGESTION** comments: Use your judgment. Fix if you agree, or reply with your reasoning if you disagree.

For each comment, either:
1. Make the code change and reply confirming what you changed
2. Reply explaining why you disagree (only for suggestion/request severity)

Refer to the shepherd-respond-to-review skill for the full workflow and batch JSON format.

Use the agent-shepherd CLI to submit your responses as a batch.`);
  }

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
