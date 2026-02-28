import type { Comment } from '../components/CommentThread.js';

export type ThreadStatus = 'resolved' | 'agent-replied' | 'needs-attention' | 'new';

export interface CommentThread {
  comment: Comment;
  replies: Comment[];
  status: ThreadStatus;
}

export function getThreadStatus(
  comment: Comment,
  replies: Comment[],
  currentCycleId: string,
): ThreadStatus {
  if (comment.resolved) return 'resolved';

  // Agent-authored top-level comments are informational — no status badge
  if (comment.author === 'agent') return 'new';

  const hasAgentReply = replies.some((r) => r.author === 'agent');
  if (hasAgentReply) return 'agent-replied';

  if (comment.reviewCycleId === currentCycleId) return 'new';

  return 'needs-attention';
}

export function groupThreads(comments: Comment[]): CommentThread[] {
  const topLevel: Comment[] = [];
  const repliesByParent = new Map<string, Comment[]>();

  for (const c of comments) {
    if (c.parentCommentId) {
      const existing = repliesByParent.get(c.parentCommentId) || [];
      existing.push(c);
      repliesByParent.set(c.parentCommentId, existing);
    } else {
      topLevel.push(c);
    }
  }

  return topLevel.map((comment) => {
    const replies = repliesByParent.get(comment.id) || [];
    return {
      comment,
      replies,
      status: 'new' as ThreadStatus,
    };
  });
}
