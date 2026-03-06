import { eq, inArray } from 'drizzle-orm';
import { AgentRunner } from '../agent-runner.js';
import { buildReviewPrompt } from './prompt-builder.js';
import { getLatestCycle } from '../../db/queries.js';
import { NotificationService } from '../../services/notifications.js';

interface FeedbackIntegratorDeps {
  db: any;
  schema: any;
  agentRunner: AgentRunner;
  notificationService: NotificationService;
}

export class FeedbackIntegrator {
  private db: any;
  private schema: any;
  private agentRunner: AgentRunner;
  private notificationService: NotificationService;

  constructor(deps: FeedbackIntegratorDeps) {
    this.db = deps.db;
    this.schema = deps.schema;
    this.agentRunner = deps.agentRunner;
    this.notificationService = deps.notificationService;
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

  async run(prId: string): Promise<void> {
    const pr = this.db.select().from(this.schema.pullRequests)
      .where(eq(this.schema.pullRequests.id, prId)).get();
    if (!pr) throw new Error(`PR not found: ${prId}`);

    const project = this.db.select().from(this.schema.projects)
      .where(eq(this.schema.projects.id, pr.projectId)).get();
    if (!project) throw new Error(`Project not found: ${pr.projectId}`);

    const currentCycle = this.getLatestCycle(prId);
    if (!currentCycle) throw new Error(`No review cycle found for PR: ${prId}`);

    // Build comment summary
    const allCycles = this.db.select().from(this.schema.reviewCycles)
      .where(eq(this.schema.reviewCycles.prId, prId)).all();
    const cycleIds = allCycles.map((c: any) => c.id);

    const allComments = this.db.select().from(this.schema.comments)
      .where(inArray(this.schema.comments.reviewCycleId, cycleIds)).all();

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

    this.setCycleStatus(currentCycle.id, 'agent_working');

    const effectivePath = pr.workingDirectory ?? project.path;

    try {
      await this.agentRunner.run(
        { prId, projectPath: effectivePath, prompt, source: 'code-fix' },
        {
          onComplete: () => {
            const latestCycle = this.getLatestCycle(prId);
            if (latestCycle && latestCycle.status === 'agent_working') {
              this.setCycleStatus(latestCycle.id, 'agent_completed');
            }
            this.notificationService.notifyPRReadyForReview(pr.title, project.name);
          },
          onError: () => {
            this.setCycleStatus(currentCycle.id, 'agent_error');
          },
        },
      );
    } catch (error) {
      this.setCycleStatus(currentCycle.id, 'agent_error');
      throw error;
    }
  }
}
