import { describe, it, expect } from 'vitest';
import type {
  Project,
  PullRequest,
  ReviewCycle,
  Comment,
  DiffSnapshot,
  PRStatus,
  ReviewCycleStatus,
  CommentSeverity,
  CommentAuthor,
  BatchCommentPayload,
} from '../types.js';

describe('Shared Types', () => {
  it('PRStatus has correct values', () => {
    const statuses: PRStatus[] = ['open', 'approved', 'closed'];
    expect(statuses).toHaveLength(3);
  });

  it('ReviewCycleStatus has correct values', () => {
    const statuses: ReviewCycleStatus[] = [
      'pending_review',
      'in_review',
      'changes_requested',
      'pending_agent',
      'approved',
    ];
    expect(statuses).toHaveLength(5);
  });

  it('CommentSeverity has correct values', () => {
    const severities: CommentSeverity[] = ['suggestion', 'request', 'must-fix'];
    expect(severities).toHaveLength(3);
  });

  it('can construct a valid Project', () => {
    const project: Project = {
      id: 'uuid-1',
      name: 'test-project',
      path: '/tmp/repo',
      baseBranch: 'main',
      createdAt: new Date().toISOString(),
    };
    expect(project.name).toBe('test-project');
  });

  it('can construct a valid BatchCommentPayload', () => {
    const payload: BatchCommentPayload = {
      comments: [
        { filePath: 'src/index.ts', startLine: 1, endLine: 1, body: 'test', severity: 'suggestion' },
      ],
      replies: [
        { parentCommentId: 'abc', body: 'reply' },
      ],
    };
    expect(payload.comments).toHaveLength(1);
    expect(payload.replies).toHaveLength(1);
  });
});
