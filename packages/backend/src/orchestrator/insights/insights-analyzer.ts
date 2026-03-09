import { eq } from 'drizzle-orm';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { rm } from 'node:fs/promises';
import type { AgentRunner } from '../agent-runner.js';
import type { SessionLogProvider } from '../session-log/provider.js';
import { buildInsightsPrompt } from './prompt-builder.js';
import { formatTranscript } from './transcript-formatter.js';
import type { AppDatabase } from '../../db/index.js';
import type * as schemaModule from '../../db/schema.js';

interface InsightsAnalyzerDeps {
  db: AppDatabase;
  schema: typeof schemaModule;
  agentRunner: AgentRunner;
  sessionLogProvider: SessionLogProvider;
}

export class InsightsAnalyzer {
  private database: AppDatabase;
  private schema: typeof schemaModule;
  private agentRunner: AgentRunner;
  private sessionLogProvider: SessionLogProvider;

  constructor(deps: InsightsAnalyzerDeps) {
    this.database = deps.db;
    this.schema = deps.schema;
    this.agentRunner = deps.agentRunner;
    this.sessionLogProvider = deps.sessionLogProvider;
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

    const sessions = await this.sessionLogProvider.findSessions({
      projectPath: project.path,
      branch: pr.sourceBranch,
    });

    const outputDirectory = path.join(
      tmpdir(),
      'agent-shepherd',
      'transcripts',
      prId,
    );
    const transcriptPaths = await Promise.all(
      sessions.map((session) => formatTranscript(session, outputDirectory)),
    );

    const existingInsights = this.database
      .select()
      .from(this.schema.insights)
      .where(eq(this.schema.insights.prId, prId))
      .get();

    const prompt = buildInsightsPrompt({
      prId,
      prTitle: pr.title,
      branch: pr.sourceBranch,
      projectId: pr.projectId,
      transcriptPaths,
      previousUpdatedAt: existingInsights?.updatedAt,
    });

    const effectivePath = pr.workingDirectory ?? project.path;
    const cleanupTranscripts = () =>
      rm(outputDirectory, { recursive: true, force: true }).catch(() => {
        /* cleanup failure is non-critical */
      });

    try {
      await this.agentRunner.run(
        {
          prId,
          projectPath: effectivePath,
          prompt,
          source: 'insights',
          additionalDirs:
            transcriptPaths.length > 0 ? [outputDirectory] : undefined,
        },
        {
          onComplete: () => {
            void cleanupTranscripts();
          },
          onError: (error) => {
            void cleanupTranscripts();
            console.error(
              `Insights analyzer error for PR ${prId}:`,
              error.message,
            );
          },
        },
      );
    } catch (error: unknown) {
      await cleanupTranscripts();
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `Insights analyzer failed to start for PR ${prId}:`,
        message,
      );
    }
  }
}
