import { useState } from 'react';
import { CommentForm } from './comment-form.js';
import type { ThreadStatus } from '../utils/comment-thread-status.js';

interface Comment {
  id: string;
  reviewCycleId: string;
  filePath: string | undefined;
  startLine: number | undefined;
  endLine: number | undefined;
  body: string;
  type: string;
  author: string;
  parentCommentId: string | undefined;
  resolved: boolean;
  createdAt: string;
}

interface CommentThreadProperties {
  comment: Comment;
  replies: Comment[];
  onReply: (commentId: string, body: string) => void;
  onResolve: (commentId: string) => void;
  onEdit?: (commentId: string, body: string) => void;
  onDelete?: (commentId: string) => void;
  canEdit?: boolean;
  threadStatus?: ThreadStatus;
}

const typeColors: Record<string, string> = {
  question: 'var(--color-question)',
  suggestion: 'var(--color-accent)',
  request: 'var(--color-warning)',
  'must-fix': 'var(--color-danger)',
};

export type { Comment };

function CommentScopeBadge({ comment }: Readonly<{ comment: Comment }>) {
  if (comment.filePath === undefined) {
    return (
      <span
        className="text-xs px-1.5 py-0.5 rounded font-mono"
        style={{
          backgroundColor: 'rgba(130, 80, 223, 0.15)',
          color: '#8250df',
        }}
      >
        PR
      </span>
    );
  }
  if (comment.startLine === undefined) {
    return (
      <span
        className="text-xs px-1.5 py-0.5 rounded font-mono"
        style={{
          backgroundColor: 'rgba(9, 105, 218, 0.15)',
          color: 'var(--color-accent)',
        }}
      >
        File
      </span>
    );
  }
  if (comment.startLine !== comment.endLine) {
    return (
      <span className="text-xs opacity-50 font-mono">
        L{comment.startLine}–L{comment.endLine}
      </span>
    );
  }
}

export function CommentThread({
  comment,
  replies,
  onReply,
  onResolve,
  onEdit,
  onDelete,
  canEdit = false,
  threadStatus,
}: Readonly<CommentThreadProperties>) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [userToggled, setUserToggled] = useState(false);
  const collapsed = threadStatus === 'resolved' && !userToggled;

  const isEditable = (c: Comment) => canEdit && c.author === 'human' && onEdit;
  const isDeletable = (c: Comment) =>
    canEdit && c.author === 'human' && onDelete;

  return (
    <div
      className="my-2 mx-4 border rounded text-sm"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-bg)',
        opacity: threadStatus === 'resolved' ? 0.5 : 1,
      }}
    >
      {/* Main comment */}
      <div
        className="p-3"
        style={{ cursor: threadStatus === 'resolved' ? 'pointer' : undefined }}
        onClick={
          threadStatus === 'resolved'
            ? () => {
                setUserToggled((t) => !t);
              }
            : undefined
        }
      >
        <div className="flex items-center gap-2 mb-1">
          {threadStatus === 'resolved' && (
            <span className="text-xs opacity-50">
              {collapsed ? '\u25B8' : '\u25BE'}
            </span>
          )}
          <span
            className="font-medium text-xs px-1.5 py-0.5 rounded"
            style={{
              backgroundColor:
                comment.author === 'human'
                  ? 'rgba(9, 105, 218, 0.15)'
                  : 'rgba(130, 80, 223, 0.15)',
              color:
                comment.author === 'human' ? 'var(--color-accent)' : '#8250df',
            }}
          >
            {comment.author}
          </span>
          <span
            className="text-xs px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: `color-mix(in srgb, ${typeColors[comment.type] ?? 'gray'} 15%, transparent)`,
              color: typeColors[comment.type] ?? 'gray',
            }}
          >
            {comment.type}
          </span>
          <CommentScopeBadge comment={comment} />
          {comment.resolved && (
            <span className="text-xs opacity-50">Resolved</span>
          )}
          {threadStatus === 'agent-replied' && (
            <span
              className="text-xs px-1.5 py-0.5 rounded font-medium"
              style={{
                backgroundColor: 'rgba(9, 105, 218, 0.15)',
                color: 'var(--color-accent)',
              }}
            >
              Agent Replied
            </span>
          )}
          {threadStatus === 'needs-attention' && (
            <span
              className="text-xs px-1.5 py-0.5 rounded font-medium"
              style={{
                backgroundColor: 'rgba(210, 153, 34, 0.15)',
                color: 'var(--color-warning, #d29922)',
              }}
            >
              Unaddressed
            </span>
          )}
          {isEditable(comment) && editingId !== comment.id && (
            <button
              onClick={() => {
                setEditingId(comment.id);
              }}
              className="text-xs opacity-50 hover:opacity-100"
            >
              Edit
            </button>
          )}
          {isDeletable(comment) && onDelete && (
            <button
              onClick={() => {
                onDelete(comment.id);
              }}
              className="text-xs opacity-50 hover:opacity-100"
              style={{ color: 'var(--color-danger)' }}
            >
              Delete
            </button>
          )}
        </div>
        {editingId === comment.id && onEdit ? (
          <CommentForm
            isEditing
            initialBody={comment.body}
            onSubmit={({ body }) => {
              onEdit(comment.id, body);
              setEditingId(undefined);
            }}
            onCancel={() => {
              setEditingId(undefined);
            }}
          />
        ) : (
          <p className="whitespace-pre-wrap">{comment.body}</p>
        )}
      </div>

      {/* Replies */}
      {!collapsed &&
        replies.map((reply) => (
          <div
            key={reply.id}
            className="p-3 border-t ml-4"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span
                className="font-medium text-xs px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor:
                    reply.author === 'human'
                      ? 'rgba(9, 105, 218, 0.15)'
                      : 'rgba(130, 80, 223, 0.15)',
                  color:
                    reply.author === 'human'
                      ? 'var(--color-accent)'
                      : '#8250df',
                }}
              >
                {reply.author}
              </span>
              {isEditable(reply) && editingId !== reply.id && (
                <button
                  onClick={() => {
                    setEditingId(reply.id);
                  }}
                  className="text-xs opacity-50 hover:opacity-100"
                >
                  Edit
                </button>
              )}
              {isDeletable(reply) && onDelete && (
                <button
                  onClick={() => {
                    onDelete(reply.id);
                  }}
                  className="text-xs opacity-50 hover:opacity-100"
                  style={{ color: 'var(--color-danger)' }}
                >
                  Delete
                </button>
              )}
            </div>
            {editingId === reply.id && onEdit ? (
              <CommentForm
                isEditing
                initialBody={reply.body}
                onSubmit={({ body }) => {
                  onEdit(reply.id, body);
                  setEditingId(undefined);
                }}
                onCancel={() => {
                  setEditingId(undefined);
                }}
              />
            ) : (
              <p className="whitespace-pre-wrap">{reply.body}</p>
            )}
          </div>
        ))}

      {/* Actions */}
      {!collapsed && (
        <div
          className="px-3 py-2 border-t flex gap-2"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <button
            onClick={() => {
              setShowReplyForm(!showReplyForm);
            }}
            className="text-xs px-2 py-1 rounded border"
            style={{ borderColor: 'var(--color-border)' }}
          >
            Reply
          </button>
          {!comment.resolved && (
            <button
              onClick={() => {
                onResolve(comment.id);
              }}
              className="text-xs px-2 py-1 rounded border"
              style={{ borderColor: 'var(--color-border)' }}
            >
              Resolve
            </button>
          )}
        </div>
      )}

      {!collapsed && showReplyForm && (
        <div className="px-3 pb-3">
          <CommentForm
            isReply
            onSubmit={({ body }) => {
              onReply(comment.id, body);
              setShowReplyForm(false);
            }}
            onCancel={() => {
              setShowReplyForm(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
