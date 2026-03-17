import { CommentForm } from './comment-form.js';
import { CommentThread } from './comment-thread.js';
import type { Comment } from './comment-thread.js';
import type { ThreadStatus } from '../utils/comment-thread-status.js';

interface GlobalCommentsProperties {
  comments: Comment[];
  repliesByParent: Map<string, Comment[]>;
  onReply: (commentId: string, body: string) => void;
  onResolve: (commentId: string) => void;
  onEdit?: (commentId: string, body: string) => void;
  onDelete?: (commentId: string) => void;
  canEditComments?: boolean;
  threadStatusMap?: Map<string, ThreadStatus>;
  globalCommentForm: boolean;
  onToggleGlobalCommentForm?: () => void;
  onSubmit: (body: string, type: string) => void;
}

export function GlobalComments({
  comments,
  repliesByParent,
  onReply,
  onResolve,
  onEdit,
  onDelete,
  canEditComments,
  threadStatusMap,
  globalCommentForm,
  onToggleGlobalCommentForm,
  onSubmit,
}: Readonly<GlobalCommentsProperties>) {
  return (
    <div
      className="mb-6 border rounded overflow-hidden"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <div
        className="px-4 py-2 text-sm font-medium border-b flex items-center gap-2"
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border)',
        }}
      >
        <span
          className="px-1.5 py-0.5 rounded text-xs"
          style={{
            backgroundColor: 'rgba(130, 80, 223, 0.15)',
            color: '#8250df',
          }}
        >
          PR
        </span>
        General comments
      </div>
      {comments.map((comment) => (
        <CommentThread
          key={comment.id}
          comment={comment}
          replies={repliesByParent.get(comment.id) ?? []}
          onReply={onReply}
          onResolve={onResolve}
          onEdit={onEdit}
          onDelete={onDelete}
          canEdit={canEditComments}
          threadStatus={threadStatusMap?.get(comment.id)}
        />
      ))}
      {globalCommentForm && (
        <div className="mx-4 my-2">
          <CommentForm
            onSubmit={({ body, type }) => {
              onSubmit(body, type ?? 'suggestion');
            }}
            onCancel={() => onToggleGlobalCommentForm?.()}
          />
        </div>
      )}
    </div>
  );
}
