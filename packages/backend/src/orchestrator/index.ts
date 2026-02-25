import { eq } from 'drizzle-orm';
import type { AgentAdapter } from './types.js';
import { ClaudeCodeAdapter } from './claude-code-adapter.js';
import { buildReviewPrompt } from './prompt-builder.js';
import { NotificationService } from '../services/notifications.js';

export { buildReviewPrompt } from './prompt-builder.js';
export { ClaudeCodeAdapter } from './claude-code-adapter.js';
export type { AgentAdapter, AgentSession } from './types.js';

interface OrchestratorDeps {
  db: any;
  schema: any;
  broadcast?: (event: string, data: any) => void;
  adapter?: AgentAdapter;
  notificationService?: NotificationService;
}

export class Orchestrator {
  private adapter: AgentAdapter;
  private db: any;
  private schema: any;
  private broadcast?: (event: string, data: any) => void;
  private notificationService: NotificationService;

  constructor(deps: OrchestratorDeps) {
    this.adapter = deps.adapter || new ClaudeCodeAdapter();
    this.db = deps.db;
    this.schema = deps.schema;
    this.broadcast = deps.broadcast;
    this.notificationService = deps.notificationService || new NotificationService();
  }

  async handleRequestChanges(prId: string) {
    const pr = this.db.select().from(this.schema.pullRequests).where(eq(this.schema.pullRequests.id, prId)).get();
    if (!pr) throw new Error(`PR not found: ${prId}`);

    const project = this.db.select().from(this.schema.projects).where(eq(this.schema.projects.id, pr.projectId)).get();
    if (!project) throw new Error(`Project not found: ${pr.projectId}`);

    // Get current cycle's comments with threads
    const cycles = this.db.select().from(this.schema.reviewCycles).where(eq(this.schema.reviewCycles.prId, prId)).all();
    const currentCycle = cycles.reduce((latest: any, c: any) => (!latest || c.cycleNumber > latest.cycleNumber) ? c : latest, null);

    if (!currentCycle) throw new Error(`No review cycle found for PR: ${prId}`);

    const allComments = this.db.select().from(this.schema.comments).where(eq(this.schema.comments.reviewCycleId, currentCycle.id)).all();

    // Build threaded comments
    const topLevel = allComments.filter((c: any) => !c.parentCommentId);
    const reviewComments = topLevel.map((c: any) => ({
      id: c.id,
      filePath: c.filePath,
      startLine: c.startLine,
      endLine: c.endLine,
      body: c.body,
      severity: c.severity,
      thread: allComments
        .filter((r: any) => r.parentCommentId === c.id)
        .map((r: any) => ({ author: r.author, body: r.body })),
    }));

    const prompt = buildReviewPrompt({
      prTitle: pr.title,
      agentContext: pr.agentContext,
      comments: reviewComments,
    });

    // Broadcast agent working status
    this.broadcast?.('agent:working', { prId });

    // Start or resume agent session
    const sessionMode = pr.agentSessionId ? 'resume' : 'new';

    try {
      const session = sessionMode === 'resume' && pr.agentSessionId
        ? await this.adapter.resumeSession({ sessionId: pr.agentSessionId, projectPath: project.path, prompt })
        : await this.adapter.startSession({ projectPath: project.path, prompt });

      session.onComplete(() => {
        this.broadcast?.('agent:completed', { prId });
        this.notificationService.notifyPRReadyForReview(pr.title, project.name);
      });

      session.onError((error) => {
        this.broadcast?.('agent:error', { prId, error: error.message });
      });
    } catch (error) {
      this.broadcast?.('agent:error', { prId, error: (error as Error).message });
    }
  }
}
