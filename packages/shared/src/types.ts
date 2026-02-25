export type PRStatus = 'open' | 'approved' | 'closed';

export type ReviewCycleStatus =
  | 'pending_review'
  | 'in_review'
  | 'changes_requested'
  | 'pending_agent'
  | 'approved';

export type CommentSeverity = 'suggestion' | 'request' | 'must-fix';

export type CommentAuthor = 'human' | 'agent';

export interface Project {
  id: string;
  name: string;
  path: string;
  baseBranch: string;
  createdAt: string;
}

export interface PullRequest {
  id: string;
  projectId: string;
  title: string;
  description: string;
  sourceBranch: string;
  baseBranch: string;
  status: PRStatus;
  agentContext: string | null;
  agentSessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewCycle {
  id: string;
  prId: string;
  cycleNumber: number;
  status: ReviewCycleStatus;
  reviewedAt: string | null;
  agentCompletedAt: string | null;
}

export interface Comment {
  id: string;
  reviewCycleId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  body: string;
  severity: CommentSeverity;
  author: CommentAuthor;
  parentCommentId: string | null;
  resolved: boolean;
  createdAt: string;
}

export interface DiffSnapshot {
  id: string;
  reviewCycleId: string;
  diffData: string;
}

export interface BatchCommentPayload {
  comments?: Array<{
    filePath: string;
    startLine: number;
    endLine: number;
    body: string;
    severity: CommentSeverity;
  }>;
  replies?: Array<{
    commentId: string;
    body: string;
  }>;
}

export interface CreateProjectInput {
  name: string;
  path: string;
  baseBranch?: string;
}

export interface CreatePRInput {
  projectId: string;
  title: string;
  description: string;
  sourceBranch: string;
  baseBranch?: string;
  agentContext?: string;
  agentSessionId?: string;
}

export interface CreateCommentInput {
  reviewCycleId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  body: string;
  severity: CommentSeverity;
  author: CommentAuthor;
  parentCommentId?: string;
}

export interface SubmitReviewInput {
  action: 'approve' | 'request-changes';
}

export interface AgentAdapterConfig {
  name: string;
  sessionMode: 'resume' | 'new';
}
