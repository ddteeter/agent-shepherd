import { existsSync } from 'fs';
import { eq, inArray } from 'drizzle-orm';
import type { AgentAdapter, AgentSession } from './types.js';
import { ClaudeCodeAdapter } from './claude-code-adapter.js';
import { buildReviewPrompt } from './review/prompt-builder.js';
import { getLatestCycle } from '../db/queries.js';
import { NotificationService } from '../services/notifications.js';

export { buildReviewPrompt } from './review/prompt-builder.js';
export { ClaudeCodeAdapter } from './claude-code-adapter.js';
export type { AgentAdapter, AgentSession } from './types.js';

interface OrchestratorDeps {
  db: any;
  schema: any;
  broadcast?: (event: string, data: any) => void;
  adapter?: AgentAdapter;
  notificationService?: NotificationService;
  devMode?: boolean;
}

export class Orchestrator {
  private adapter: AgentAdapter;
  private db: any;
  private schema: any;
  private broadcast?: (event: string, data: any) => void;
  private notificationService: NotificationService;
  private activeSessions = new Map<string, AgentSession>();

  constructor(deps: OrchestratorDeps) {
    this.adapter = deps.adapter || new ClaudeCodeAdapter({ devMode: deps.devMode });
    this.db = deps.db;
    this.schema = deps.schema;
    this.broadcast = deps.broadcast;
    this.notificationService = deps.notificationService || new NotificationService();
  }

  private getLatestCycle(prId: string) {
    return getLatestCycle(this.db, prId);
  }

  private setCycleStatus(cycleId: string, status: string) {
    this.db.update(this.schema.reviewCycles)
      .set({ status })
      .where(eq(this.schema.reviewCycles.id, cycleId))
      .run();
  }

  async handleRequestChanges(prId: string) {
    const pr = this.db.select().from(this.schema.pullRequests).where(eq(this.schema.pullRequests.id, prId)).get();
    if (!pr) throw new Error(`PR not found: ${prId}`);

    const project = this.db.select().from(this.schema.projects).where(eq(this.schema.projects.id, pr.projectId)).get();
    if (!project) throw new Error(`Project not found: ${pr.projectId}`);

    const currentCycle = this.getLatestCycle(prId);
    if (!currentCycle) throw new Error(`No review cycle found for PR: ${prId}`);

    // Get all cycles for this PR
    const allCycles = this.db.select().from(this.schema.reviewCycles)
      .where(eq(this.schema.reviewCycles.prId, prId)).all();
    const cycleIds = allCycles.map((c: any) => c.id);

    // Get ALL comments across all cycles
    const allComments = this.db.select().from(this.schema.comments)
      .where(inArray(this.schema.comments.reviewCycleId, cycleIds)).all();

    // Build summary from unresolved top-level comments
    const topLevel = allComments.filter((c: any) => !c.parentCommentId && !c.resolved);

    const bySeverity: Record<string, number> = {};
    const fileMap = new Map<string, { count: number; bySeverity: Record<string, number> }>();
    let generalCount = 0;

    for (const c of topLevel) {
      bySeverity[c.severity] = (bySeverity[c.severity] || 0) + 1;
      if (!c.filePath) {
        generalCount++;
      } else {
        const entry = fileMap.get(c.filePath) || { count: 0, bySeverity: {} };
        entry.count++;
        entry.bySeverity[c.severity] = (entry.bySeverity[c.severity] || 0) + 1;
        fileMap.set(c.filePath, entry);
      }
    }

    const prompt = buildReviewPrompt({
      prId,
      prTitle: pr.title,
      agentContext: pr.agentContext,
      commentSummary: {
        total: topLevel.length,
        bySeverity,
        files: [...fileMap.entries()].map(([path, data]) => ({ path, ...data })),
        generalCount,
      },
    });

    // Persist agent_working status
    this.setCycleStatus(currentCycle.id, 'agent_working');
    this.broadcast?.('agent:working', { prId });

    try {
      // Use the PR's working directory (e.g., worktree path) if available, otherwise fall back to project path
      const effectivePath = pr.workingDirectory ?? project.path;

      // Verify the working directory exists before spawning agent
      if (!existsSync(effectivePath)) {
        const error = new Error(
          `Working directory does not exist: ${effectivePath}\n` +
          'The worktree may have been removed. Recreate it and try again.'
        );
        this.setCycleStatus(currentCycle.id, 'agent_error');
        this.broadcast?.('agent:error', { prId, error: error.message });
        throw error;
      }

      const session = await this.adapter.startSession({ projectPath: effectivePath, prompt });

      this.activeSessions.set(prId, session);

      session.onOutput((entry) => {
        this.broadcast?.('agent:output', { prId, entry });
      });

      session.onComplete(() => {
        this.activeSessions.delete(prId);
        // Update cycle status if agent-ready hasn't already created a new cycle
        const latestCycle = this.getLatestCycle(prId);
        if (latestCycle && latestCycle.status === 'agent_working') {
          this.setCycleStatus(latestCycle.id, 'agent_completed');
        }
        this.broadcast?.('agent:completed', { prId });
        this.notificationService.notifyPRReadyForReview(pr.title, project.name);
      });

      session.onError((error) => {
        this.activeSessions.delete(prId);
        this.setCycleStatus(currentCycle.id, 'agent_error');
        this.broadcast?.('agent:error', { prId, error: error.message });
      });
    } catch (error) {
      this.activeSessions.delete(prId);
      this.setCycleStatus(currentCycle.id, 'agent_error');
      this.broadcast?.('agent:error', { prId, error: (error as Error).message });
    }
  }

  async cancelAgent(prId: string) {
    const session = this.activeSessions.get(prId);
    if (session) {
      await session.kill();
      this.activeSessions.delete(prId);
    }

    const currentCycle = this.getLatestCycle(prId);
    if (currentCycle && currentCycle.status === 'agent_working') {
      this.setCycleStatus(currentCycle.id, 'changes_requested');
    }

    this.broadcast?.('agent:cancelled', { prId });
  }
}
