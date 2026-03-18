import type React from 'react';
import { CommentThread } from './comment-thread.js';
import type { Comment } from './comment-thread.js';
import type { ThreadStatus } from '../utils/comment-thread-status.js';

interface OrphanedCommentsProperties {
  comments: Comment[];
  repliesByParent: Map<string, Comment[]>;
  onReply: (commentId: string, body: string) => void;
  onResolve: (commentId: string) => void;
  onEdit?: (commentId: string, body: string) => void;
  onDelete?: (commentId: string) => void;
  canEditComments?: boolean;
  threadStatusMap?: Map<string, ThreadStatus>;
  label?: string;
}

export function OrphanedComments({
  comments,
  repliesByParent,
  onReply,
  onResolve,
  onEdit,
  onDelete,
  canEditComments,
  threadStatusMap,
}: Readonly<OrphanedCommentsProperties>): React.ReactElement | undefined {
  if (comments.length === 0) return undefined;

  return (
    <div className="border-t" style={{ borderColor: 'var(--color-border)' }}>
      <div
        className="px-4 py-2 text-xs"
        style={{
          opacity: 0.6,
          backgroundColor: 'var(--color-bg-secondary)',
        }}
      >
        Comments on lines no longer in this diff
      </div>
      {comments.map((comment) => (
        <div key={comment.id} className="px-4 py-1">
          {comment.startLine !== undefined && (
            <div className="text-xs mb-1" style={{ opacity: 0.5 }}>
              Line
              {comment.startLine !== comment.endLine &&
              comment.endLine !== undefined
                ? `s ${String(comment.startLine)}–${String(comment.endLine)}`
                : ` ${String(comment.startLine)}`}
            </div>
          )}
          <CommentThread
            comment={comment}
            replies={repliesByParent.get(comment.id) ?? []}
            onReply={onReply}
            onResolve={onResolve}
            onEdit={onEdit}
            onDelete={onDelete}
            canEdit={canEditComments}
            threadStatus={threadStatusMap?.get(comment.id)}
          />
        </div>
      ))}
    </div>
  );
}
