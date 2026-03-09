export type PRStatus = 'open' | 'approved' | 'closed';

export type ReviewCycleStatus =
  | 'pending_review'
  | 'in_review'
  | 'changes_requested'
  | 'agent_working'
  | 'agent_completed'
  | 'agent_error'
  | 'approved'
  | 'superseded';

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
  workingDirectory: string | null;
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
  context: string | null;
}

export interface Comment {
  id: string;
  reviewCycleId: string;
  filePath: string | null;
  startLine: number | null;
  endLine: number | null;
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
  fileGroups?: FileGroup[];
}

export interface FileGroup {
  name: string;
  description?: string;
  files: string[];
}

export interface BatchCommentPayload {
  comments: {
    filePath?: string | null;
    startLine?: number | null;
    endLine?: number | null;
    body: string;
    severity?: CommentSeverity;
  }[];
  replies?: {
    parentCommentId: string;
    body: string;
    severity?: CommentSeverity;
  }[];
}

export interface CreateProjectInput {
  name: string;
  path: string;
  baseBranch?: string;
}

export interface CreatePRInput {
  projectId: string;
  title: string;
  description?: string;
  sourceBranch: string;
  baseBranch?: string;
  agentContext?: string;
  workingDirectory?: string;
}

export interface CommentSummary {
  total: number;
  bySeverity: Record<string, number>;
  files: { path: string; count: number; bySeverity: Record<string, number> }[];
  generalCount: number;
}

export interface CreateCommentInput {
  filePath?: string | null;
  startLine?: number | null;
  endLine?: number | null;
  body: string;
  severity?: CommentSeverity;
  author: CommentAuthor;
  parentCommentId?: string;
}

export interface SubmitReviewInput {
  action: 'approve' | 'request-changes';
}

export type InsightConfidence = 'high' | 'medium' | 'low';

export interface InsightItem {
  title: string;
  description: string;
  confidence: InsightConfidence;
  appliedPath?: string;
}

export interface RecurringPatternItem {
  title: string;
  description: string;
  confidence: InsightConfidence;
  prIds: string[];
}

export interface InsightCategories {
  claudeMdRecommendations: InsightItem[];
  skillRecommendations: InsightItem[];
  promptEngineering: InsightItem[];
  agentBehaviorObservations: InsightItem[];
  recurringPatterns: RecurringPatternItem[];
}

export interface Insights {
  id: string;
  prId: string;
  categories: InsightCategories;
  branchRef: string | null;
  worktreePath: string | null;
  updatedAt: string;
}
