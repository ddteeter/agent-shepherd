import type { CommentSide } from '@agent-shepherd/shared';

export interface AddCommentData {
  filePath: string | undefined;
  startLine: number | undefined;
  endLine: number | undefined;
  body: string;
  type: string;
  side: CommentSide | undefined;
}

export interface CommentActions {
  onAdd?: (data: AddCommentData) => void;
  onReply?: (commentId: string, body: string) => void;
  onResolve?: (commentId: string) => void;
  onEdit?: (commentId: string, body: string) => void;
  onDelete?: (commentId: string) => void;
}

export type { FileDiffData, FileStatus } from '../utils/diff-parser.js';
