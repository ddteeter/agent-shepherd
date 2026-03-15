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

export type CommentType = 'question' | 'suggestion' | 'request' | 'must-fix';

export type CommentAuthor = 'human' | 'agent';

export type CommentSide = 'old' | 'new';

export interface Project {
  id: string;
  name: string;
  path: string;
  baseBranch: string;
  createdAt: string;
}

export interface ProjectWithStats extends Project {
  pendingReviewCount: number;
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
  side: CommentSide | null;
  body: string;
  type: CommentType;
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
    side?: CommentSide | null;
    body: string;
    type?: CommentType;
  }[];
  replies?: {
    parentCommentId: string;
    body: string;
    type?: CommentType;
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
  byType: Record<string, number>;
  files: { path: string; count: number; byType: Record<string, number> }[];
  generalCount: number;
}

export interface CreateCommentInput {
  filePath?: string | null;
  startLine?: number | null;
  endLine?: number | null;
  side?: CommentSide | null;
  body: string;
  type?: CommentType;
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
  firstSeenAt: string;
  lastUpdatedAt?: string;
}

export interface RecurringPatternItem {
  title: string;
  description: string;
  confidence: InsightConfidence;
  prIds: string[];
  firstSeenAt: string;
  lastUpdatedAt?: string;
}

export interface ToolRecommendationItem {
  title: string;
  description: string;
  confidence: InsightConfidence;
  implementationPrompt: string;
  firstSeenAt: string;
  lastUpdatedAt?: string;
}

export interface InsightCategories {
  toolRecommendations: ToolRecommendationItem[];
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
  previousUpdatedAt: string | null;
}
