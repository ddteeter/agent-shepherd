import { eq, inArray, type InferSelectModel } from 'drizzle-orm';
import { AgentRunner } from '../agent-runner.js';
import { buildReviewPrompt } from './prompt-builder.js';
import { buildCommentSummary } from '../../routes/comments.js';
import { getLatestCycle } from '../../db/queries.js';
import { NotificationService } from '../../services/notifications.js';
import type { AppDatabase } from '../../db/index.js';
import type * as schemaModule from '../../db/schema.js';

type ReviewCycleRow = InferSelectModel<typeof schemaModule.reviewCycles>;

interface FeedbackIntegratorDeps {
  db: AppDatabase;
  schema: typeof schemaModule;
  agentRunner: AgentRunner;
  notificationService: NotificationService;
}

export class FeedbackIntegrator {
  private database: AppDatabase;
  private schema: typeof schemaModule;
  private agentRunner: AgentRunner;
  private notificationService: NotificationService;

  constructor(deps: FeedbackIntegratorDeps) {
    this.database = deps.db;
    this.schema = deps.schema;
    this.agentRunner = deps.agentRunner;
    this.notificationService = deps.notificationService;
  }

  private getLatestCycle(prId: string) {
    return getLatestCycle(this.database, prId);
  }

  private setCycleStatus(cycleId: string, status: string) {
    this.database
      .update(this.schema.reviewCycles)
      .set({ status })
      .where(eq(this.schema.reviewCycles.id, cycleId))
      .run();
  }

  async run(prId: string): Promise<void> {
    const pr = this.database
      .select()
      .from(this.schema.pullRequests)
      .where(eq(this.schema.pullRequests.id, prId))
      .get();
    if (!pr) throw new Error(`PR not found: ${prId}`);

    const project = this.database
      .select()
      .from(this.schema.projects)
      .where(eq(this.schema.projects.id, pr.projectId))
      .get();
    if (!project) throw new Error(`Project not found: ${pr.projectId}`);

    const currentCycle = this.getLatestCycle(prId);
    if (!currentCycle) throw new Error(`No review cycle found for PR: ${prId}`);

    const allCycles = this.database
      .select()
      .from(this.schema.reviewCycles)
      .where(eq(this.schema.reviewCycles.prId, prId))
      .all();
    const cycleIds = allCycles.map((cycle: ReviewCycleRow) => cycle.id);

    const allComments = this.database
      .select()
      .from(this.schema.comments)
      .where(inArray(this.schema.comments.reviewCycleId, cycleIds))
      .all();

    const commentSummary = buildCommentSummary(
      allComments,
      allCycles,
      this.database,
    );

    const prompt = buildReviewPrompt({
      prId,
      prTitle: pr.title,
      agentContext: pr.agentContext ?? undefined,
      commentSummary,
    });

    this.setCycleStatus(currentCycle.id, 'agent_working');

    const effectivePath = pr.workingDirectory ?? project.path;

    try {
      await this.agentRunner.run(
        { prId, projectPath: effectivePath, prompt, source: 'code-fix' },
        {
          onComplete: () => {
            const latestCycle = this.getLatestCycle(prId);
            if (latestCycle?.status === 'agent_working') {
              this.setCycleStatus(latestCycle.id, 'agent_completed');
            }
            this.notificationService.notifyPRReadyForReview(
              pr.title,
              project.name,
            );
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
