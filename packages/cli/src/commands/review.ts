import { Command } from 'commander';
import { ApiClient } from '../api-client.js';

interface CommentSummary {
  total: number;
  bySeverity: Record<string, number>;
  files: Array<{ path: string; count: number; bySeverity: Record<string, number> }>;
  generalCount: number;
}

interface Comment {
  id: string;
  filePath: string | null;
  startLine: number | null;
  endLine: number | null;
  body: string;
  severity: string;
  author: string;
  parentCommentId: string | null;
  resolved: boolean;
}

function formatSummary(summary: CommentSummary, prTitle: string): string {
  const lines: string[] = [];
  lines.push(`# Review Comments for: ${prTitle} (${summary.total} comments)\n`);
  lines.push(`## Summary`);
  for (const [sev, count] of Object.entries(summary.bySeverity)) {
    lines.push(`- ${count} ${sev}`);
  }
  lines.push('');

  if (summary.generalCount > 0) {
    lines.push(`General comments: ${summary.generalCount}`);
    lines.push('');
  }

  if (summary.files.length > 0) {
    lines.push(`## Files (in diff order)`);
    for (let i = 0; i < summary.files.length; i++) {
      const f = summary.files[i];
      const sevParts = Object.entries(f.bySeverity).map(([s, c]) => `${c} ${s}`).join(', ');
      lines.push(`${i + 1}. ${f.path} (${f.count} comments: ${sevParts})`);
    }
  }

  return lines.join('\n');
}

function formatComments(comments: Comment[], heading: string): string {
  // Separate top-level from replies
  const topLevel = comments.filter(c => !c.parentCommentId && !c.resolved);
  const replies = comments.filter(c => c.parentCommentId);

  // Sort top-level: general first, then by line number
  const general = topLevel.filter(c => !c.filePath);
  const withFile = topLevel.filter(c => c.filePath);
  withFile.sort((a, b) => (a.startLine ?? 0) - (b.startLine ?? 0));

  const ordered = [...general, ...withFile];
  const lines: string[] = [];
  lines.push(`# ${heading}\n`);

  for (const c of ordered) {
    const sevLabel = c.severity === 'must-fix' ? 'MUST FIX' : c.severity.toUpperCase();
    let location = '';
    if (c.startLine != null) {
      location = c.startLine === c.endLine || c.endLine == null
        ? ` Line ${c.startLine}`
        : ` Lines ${c.startLine}-${c.endLine}`;
    }
    lines.push(`[${sevLabel}]${location} (comment ID: ${c.id})`);
    lines.push(`> ${c.body}`);

    // Find thread replies for this comment
    const thread = replies.filter(r => r.parentCommentId === c.id);
    if (thread.length > 0) {
      lines.push('Thread:');
      for (const r of thread) {
        lines.push(`  - ${r.author}: ${r.body}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function reviewCommand(program: Command, client: ApiClient) {
  const review = program
    .command('review')
    .description('Review tools for working with PR comments');

  review
    .command('comments <pr-id>')
    .description('Fetch review comments for a PR')
    .option('--summary', 'Show comment counts and file list only')
    .option('--file <path>', 'Filter to comments on a specific file')
    .option('--severity <level>', 'Filter by severity (must-fix, request, suggestion)')
    .option('--all', 'Fetch all comments')
    .action(async (prId: string, opts: { summary?: boolean; file?: string; severity?: string; all?: boolean }) => {
      const pr = await client.get<{ title: string }>(`/api/prs/${prId}`);

      if (opts.summary) {
        const summary = await client.get<CommentSummary>(`/api/prs/${prId}/comments?summary=true`);
        console.log(formatSummary(summary, pr.title));
        return;
      }

      // Build query params
      const params = new URLSearchParams();
      if (opts.file) params.set('filePath', opts.file);
      if (opts.severity) params.set('severity', opts.severity);
      const qs = params.toString();
      const url = `/api/prs/${prId}/comments${qs ? `?${qs}` : ''}`;

      const comments = await client.get<Comment[]>(url);
      const heading = opts.file
        ? `Comments for: ${opts.file}`
        : opts.severity
          ? `${opts.severity} comments`
          : `All comments`;

      console.log(formatComments(comments, heading));
    });
}
