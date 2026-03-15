import { Command } from 'commander';
import type { CommentSummary } from '@agent-shepherd/shared';
import { ApiClient } from '../api-client.js';

interface Comment {
  id: string;
  filePath: string | undefined;
  startLine: number | undefined;
  endLine: number | undefined;
  body: string;
  type: string;
  author: string;
  parentCommentId: string | undefined;
  resolved: boolean;
}

function formatSummary(summary: CommentSummary, prTitle: string): string {
  const lines: string[] = [
    `# Review Comments for: ${prTitle} (${String(summary.total)} comments)\n`,
    `## Summary`,
  ];
  for (const [typ, count] of Object.entries(summary.byType)) {
    lines.push(`- ${String(count)} ${typ}`);
  }
  lines.push('');

  if (summary.generalCount > 0) {
    lines.push(`General comments: ${String(summary.generalCount)}`, '');
  }

  if (summary.files.length > 0) {
    lines.push(`## Files (in diff order)`);
    for (let index = 0; index < summary.files.length; index++) {
      const f = summary.files[index];
      const typeParts = Object.entries(f.byType)
        .map(([s, c]) => `${String(c)} ${s}`)
        .join(', ');
      lines.push(
        `${String(index + 1)}. ${f.path} (${String(f.count)} comments: ${typeParts})`,
      );
    }
  }

  return lines.join('\n');
}

function formatComments(comments: Comment[], heading: string): string {
  const topLevel = comments.filter((c) => !c.parentCommentId && !c.resolved);
  const replies = comments.filter((c) => c.parentCommentId);

  const general = topLevel.filter((c) => !c.filePath);
  const withFile = topLevel.filter((c) => c.filePath);
  withFile.sort((a, b) => (a.startLine ?? 0) - (b.startLine ?? 0));

  const ordered = [...general, ...withFile];
  const lines: string[] = [`# ${heading}\n`];

  for (const c of ordered) {
    const typeLabel = c.type === 'must-fix' ? 'MUST FIX' : c.type.toUpperCase();
    let location = '';
    if (c.startLine != undefined) {
      location =
        c.startLine === c.endLine || c.endLine == undefined
          ? ` Line ${String(c.startLine)}`
          : ` Lines ${String(c.startLine)}-${String(c.endLine)}`;
    }
    lines.push(
      `[${typeLabel}]${location} (comment ID: ${c.id})`,
      `> ${c.body}`,
    );

    const thread = replies.filter((r) => r.parentCommentId === c.id);
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
    .option(
      '--type <level>',
      'Filter by type (must-fix, request, suggestion, question)',
    )
    .option('--all', 'Fetch all comments')
    .action(
      async (
        prId: string,
        options: {
          summary?: boolean;
          file?: string;
          type?: string;
          all?: boolean;
        },
      ) => {
        const pr = await client.get<{ title: string }>(`/api/prs/${prId}`);

        if (options.summary) {
          const summary = await client.get<CommentSummary>(
            `/api/prs/${prId}/comments?summary=true`,
          );
          console.log(formatSummary(summary, pr.title));
          return;
        }

        const parameters = new URLSearchParams();
        if (options.file) parameters.set('filePath', options.file);
        if (options.type) parameters.set('type', options.type);
        const qs = parameters.toString();
        const queryString = qs ? `?${qs}` : '';
        const url = `/api/prs/${prId}/comments${queryString}`;

        const comments = await client.get<Comment[]>(url);
        let heading = 'All comments';
        if (options.file) {
          heading = `Comments for: ${options.file}`;
        } else if (options.type) {
          heading = `${options.type} comments`;
        }

        console.log(formatComments(comments, heading));
      },
    );
}
