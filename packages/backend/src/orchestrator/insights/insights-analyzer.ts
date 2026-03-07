import { eq } from 'drizzle-orm';
import type { AgentRunner } from '../agent-runner.js';
import type { SessionLogProvider } from '../session-log/provider.js';
import { buildInsightsPrompt } from './prompt-builder.js';

interface InsightsAnalyzerDeps {
  db: any;
  schema: any;
  agentRunner: AgentRunner;
  sessionLogProvider: SessionLogProvider;
}

export class InsightsAnalyzer {
  private db: any;
  private schema: any;
  private agentRunner: AgentRunner;
  private sessionLogProvider: SessionLogProvider;

  constructor(deps: InsightsAnalyzerDeps) {
    this.db = deps.db;
    this.schema = deps.schema;
    this.agentRunner = deps.agentRunner;
    this.sessionLogProvider = deps.sessionLogProvider;
  }

  async run(prId: string): Promise<void> {
    const pr = this.db.select().from(this.schema.pullRequests)
      .where(eq(this.schema.pullRequests.id, prId)).get();
    if (!pr) throw new Error(`PR not found: ${prId}`);

    const project = this.db.select().from(this.schema.projects)
      .where(eq(this.schema.projects.id, pr.projectId)).get();
    if (!project) throw new Error(`Project not found: ${pr.projectId}`);

    // Discover session logs for this branch
    const sessions = await this.sessionLogProvider.findSessions({
      projectPath: project.path,
      branch: pr.sourceBranch,
    });

    // Build prompt
    const prompt = buildInsightsPrompt({
      prId,
      prTitle: pr.title,
      branch: pr.sourceBranch,
      projectId: pr.projectId,
      sessionLogPaths: sessions.map(s => s.filePath),
    });

    const effectivePath = pr.workingDirectory ?? project.path;

    try {
      await this.agentRunner.run(
        { prId, projectPath: effectivePath, prompt, source: 'insights' },
        {
          onComplete: () => {
            // Insights completion is non-critical — no cycle status to update
          },
          onError: (error) => {
            console.error(`Insights analyzer error for PR ${prId}:`, error.message);
          },
        },
      );
    } catch (error) {
      console.error(`Insights analyzer failed to start for PR ${prId}:`, (error as Error).message);
    }
  }
}
