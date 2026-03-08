import type { AgentAdapter, AgentSource } from './types.js';
import { ClaudeCodeAdapter } from './claude-code-adapter.js';
import { AgentRunner } from './agent-runner.js';
import { FeedbackIntegrator } from './review/feedback-integrator.js';
import { InsightsAnalyzer } from './insights/insights-analyzer.js';
import { ClaudeCodeSessionLogProvider } from './session-log/claude-code-provider.js';
import { NotificationService } from '../services/notifications.js';
import type { SessionLogProvider } from './session-log/provider.js';

export { AgentRunner } from './agent-runner.js';
export { ClaudeCodeAdapter } from './claude-code-adapter.js';
export { FeedbackIntegrator } from './review/feedback-integrator.js';
export { InsightsAnalyzer } from './insights/insights-analyzer.js';
export type { AgentAdapter, AgentSession, AgentSource } from './types.js';
export { buildReviewPrompt } from './review/prompt-builder.js';

interface OrchestratorDeps {
  db: any;
  schema: any;
  broadcast?: (event: string, data: any) => void;
  adapter?: AgentAdapter;
  sessionLogProvider?: SessionLogProvider;
  notificationService?: NotificationService;
  devMode?: boolean;
}

export class Orchestrator {
  private feedbackIntegrator: FeedbackIntegrator;
  private insightsAnalyzer: InsightsAnalyzer;
  private agentRunner: AgentRunner;

  constructor(deps: OrchestratorDeps) {
    const adapter =
      deps.adapter || new ClaudeCodeAdapter({ devMode: deps.devMode });
    const broadcast = deps.broadcast || (() => {});
    const notificationService =
      deps.notificationService || new NotificationService();
    const sessionLogProvider =
      deps.sessionLogProvider || new ClaudeCodeSessionLogProvider();

    this.agentRunner = new AgentRunner({ adapter, broadcast });

    this.feedbackIntegrator = new FeedbackIntegrator({
      db: deps.db,
      schema: deps.schema,
      agentRunner: this.agentRunner,
      notificationService,
    });

    this.insightsAnalyzer = new InsightsAnalyzer({
      db: deps.db,
      schema: deps.schema,
      agentRunner: this.agentRunner,
      sessionLogProvider,
    });
  }

  async handleRequestChanges(prId: string): Promise<void> {
    // Run both in parallel — insights errors don't block code-fix
    const codeFixPromise = this.feedbackIntegrator.run(prId);
    const insightsPromise = this.insightsAnalyzer.run(prId).catch((err) => {
      console.error(`Insights analysis failed for PR ${prId}:`, err.message);
    });

    await Promise.all([codeFixPromise, insightsPromise]);
  }

  async runInsights(prId: string): Promise<void> {
    await this.insightsAnalyzer.run(prId);
  }

  hasActiveAgent(prId: string, source: AgentSource): boolean {
    return this.agentRunner.hasActiveSession(prId, source);
  }

  async cancelAgent(prId: string, source?: AgentSource): Promise<void> {
    if (source) {
      await this.agentRunner.cancel(prId, source);
    } else {
      // Cancel both if no source specified
      await this.agentRunner.cancel(prId, 'code-fix');
      await this.agentRunner.cancel(prId, 'insights');
    }
  }
}
