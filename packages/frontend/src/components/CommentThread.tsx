import { useState } from 'react';
import { CommentForm } from './CommentForm.js';

interface Comment {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  body: string;
  severity: string;
  author: string;
  parentCommentId: string | null;
  resolved: boolean;
  createdAt: string;
}

interface CommentThreadProps {
  comment: Comment;
  replies: Comment[];
  onReply: (commentId: string, body: string) => void;
  onResolve: (commentId: string) => void;
}

const severityColors: Record<string, string> = {
  'suggestion': 'var(--color-accent)',
  'request': 'var(--color-warning)',
  'must-fix': 'var(--color-danger)',
};

export type { Comment };

export function CommentThread({ comment, replies, onReply, onResolve }: CommentThreadProps) {
  const [showReplyForm, setShowReplyForm] = useState(false);

  return (
    <div className="my-2 mx-4 border rounded text-sm" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
      {/* Main comment */}
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-xs px-1.5 py-0.5 rounded" style={{
            backgroundColor: comment.author === 'human' ? 'rgba(9, 105, 218, 0.15)' : 'rgba(130, 80, 223, 0.15)',
            color: comment.author === 'human' ? 'var(--color-accent)' : '#8250df',
          }}>
            {comment.author}
          </span>
          <span className="text-xs px-1.5 py-0.5 rounded" style={{
            backgroundColor: `color-mix(in srgb, ${severityColors[comment.severity] || 'gray'} 15%, transparent)`,
            color: severityColors[comment.severity] || 'gray',
          }}>
            {comment.severity}
          </span>
          {comment.resolved && (
            <span className="text-xs opacity-50">Resolved</span>
          )}
        </div>
        <p className="whitespace-pre-wrap">{comment.body}</p>
      </div>

      {/* Replies */}
      {replies.map((reply) => (
        <div key={reply.id} className="p-3 border-t ml-4" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-xs px-1.5 py-0.5 rounded" style={{
              backgroundColor: reply.author === 'human' ? 'rgba(9, 105, 218, 0.15)' : 'rgba(130, 80, 223, 0.15)',
              color: reply.author === 'human' ? 'var(--color-accent)' : '#8250df',
            }}>
              {reply.author}
            </span>
          </div>
          <p className="whitespace-pre-wrap">{reply.body}</p>
        </div>
      ))}

      {/* Actions */}
      <div className="px-3 py-2 border-t flex gap-2" style={{ borderColor: 'var(--color-border)' }}>
        <button
          onClick={() => setShowReplyForm(!showReplyForm)}
          className="text-xs px-2 py-1 rounded border" style={{ borderColor: 'var(--color-border)' }}
        >
          Reply
        </button>
        {!comment.resolved && (
          <button
            onClick={() => onResolve(comment.id)}
            className="text-xs px-2 py-1 rounded border" style={{ borderColor: 'var(--color-border)' }}
          >
            Resolve
          </button>
        )}
      </div>

      {showReplyForm && (
        <div className="px-3 pb-3">
          <CommentForm
            isReply
            onSubmit={({ body }) => {
              onReply(comment.id, body);
              setShowReplyForm(false);
            }}
            onCancel={() => setShowReplyForm(false)}
          />
        </div>
      )}
    </div>
  );
}
