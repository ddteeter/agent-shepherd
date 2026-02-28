import { describe, it, expect } from 'vitest';
import { getThreadStatus, groupThreads, type ThreadStatus } from '../commentThreadStatus.js';
import type { Comment } from '../../components/CommentThread.js';

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c1',
    reviewCycleId: 'cycle-1',
    filePath: 'src/index.ts',
    startLine: 10,
    endLine: 10,
    body: 'Test',
    severity: 'suggestion',
    author: 'human',
    parentCommentId: null,
    resolved: false,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('getThreadStatus', () => {
  it('returns "resolved" when top-level comment is resolved', () => {
    const comment = makeComment({ resolved: true });
    const replies: Comment[] = [];
    expect(getThreadStatus(comment, replies, 'cycle-2')).toBe('resolved');
  });

  it('returns "agent-replied" when thread has agent reply and is not resolved', () => {
    const comment = makeComment({ reviewCycleId: 'cycle-1' });
    const replies = [makeComment({ id: 'r1', author: 'agent', parentCommentId: 'c1' })];
    expect(getThreadStatus(comment, replies, 'cycle-2')).toBe('agent-replied');
  });

  it('returns "needs-attention" when no agent reply and from a previous cycle', () => {
    const comment = makeComment({ reviewCycleId: 'cycle-1' });
    const replies: Comment[] = [];
    expect(getThreadStatus(comment, replies, 'cycle-2')).toBe('needs-attention');
  });

  it('returns "new" when comment is from the current cycle', () => {
    const comment = makeComment({ reviewCycleId: 'cycle-2' });
    const replies: Comment[] = [];
    expect(getThreadStatus(comment, replies, 'cycle-2')).toBe('new');
  });

  it('returns "new" when there is only one cycle (first review)', () => {
    const comment = makeComment({ reviewCycleId: 'cycle-1' });
    const replies: Comment[] = [];
    expect(getThreadStatus(comment, replies, 'cycle-1')).toBe('new');
  });

  it('resolved takes priority over agent-replied', () => {
    const comment = makeComment({ resolved: true, reviewCycleId: 'cycle-1' });
    const replies = [makeComment({ id: 'r1', author: 'agent', parentCommentId: 'c1' })];
    expect(getThreadStatus(comment, replies, 'cycle-2')).toBe('resolved');
  });

  it('human-only replies do not count as agent-replied', () => {
    const comment = makeComment({ reviewCycleId: 'cycle-1' });
    const replies = [makeComment({ id: 'r1', author: 'human', parentCommentId: 'c1' })];
    expect(getThreadStatus(comment, replies, 'cycle-2')).toBe('needs-attention');
  });
});

describe('groupThreads', () => {
  it('groups top-level comments with their replies', () => {
    const comments = [
      makeComment({ id: 'c1' }),
      makeComment({ id: 'r1', parentCommentId: 'c1' }),
      makeComment({ id: 'c2', filePath: null, startLine: null, endLine: null }),
    ];
    const threads = groupThreads(comments);
    expect(threads).toHaveLength(2);
    expect(threads[0].comment.id).toBe('c1');
    expect(threads[0].replies).toHaveLength(1);
    expect(threads[1].comment.id).toBe('c2');
    expect(threads[1].replies).toHaveLength(0);
  });
});
