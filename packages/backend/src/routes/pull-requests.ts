import type { FastifyInstance } from 'fastify';
import type { CreatePRInput, SubmitReviewInput } from '@agent-shepherd/shared';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { schema } from '../db/index.js';
import { getLatestCycle } from '../db/queries.js';
import { GitService } from '../services/git.js';
import type { AgentSource } from '../orchestrator/types.js';

export function pullRequestRoutes(fastify: FastifyInstance) {
  const database = fastify.db;

  fastify.post('/api/projects/:projectId/prs', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const {
      title,
      description,
      sourceBranch,
      baseBranch,
      workingDirectory,
      fileGroups,
    } = request.body as Omit<CreatePRInput, 'projectId'> & {
      fileGroups?: {
        name: string;
        description?: string;
        files: string[];
      }[];
    };

    // Verify project exists
    const project = database
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get();

    if (!project) {
      await reply.code(404).send({ error: 'Project not found' });
      return;
    }

    const prId = randomUUID();
    database
      .insert(schema.pullRequests)
      .values({
        id: prId,
        projectId,
        title,
        description: description ?? '',
        sourceBranch,
        baseBranch: baseBranch ?? project.baseBranch,
        status: 'open',
        workingDirectory,
      })
      .run();

    // Try to capture commit SHA for the initial cycle
    let commitSha: string | undefined;
    try {
      const gitService = new GitService(project.path);
      commitSha = await gitService.getHeadSha(sourceBranch);
    } catch {
      // Non-fatal: SHA capture may fail if branch doesn't exist locally
    }

    // Create first review cycle
    const cycleId = randomUUID();
    database
      .insert(schema.reviewCycles)
      .values({
        id: cycleId,
        prId,
        cycleNumber: 1,
        status: 'pending_review',
        commitSha,
      })
      .run();

    // Store diff snapshot for cycle 1
    try {
      const gitService = new GitService(project.path);
      const diffData = await gitService.getDiff(
        baseBranch ?? project.baseBranch,
        sourceBranch,
      );
      database
        .insert(schema.diffSnapshots)
        .values({
          id: randomUUID(),
          reviewCycleId: cycleId,
          diffData,
          fileGroups: fileGroups ? JSON.stringify(fileGroups) : undefined,
        })
        .run();
    } catch {
      // Non-fatal: snapshot storage failure should not block PR creation
    }

    const pr = database
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.id, prId))
      .get();

    fastify.broadcast('pr:created', pr);

    await reply.code(201).send(pr);
  });

  fastify.get('/api/projects/:projectId/prs', (request) => {
    const { projectId } = request.params as { projectId: string };
    return database
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.projectId, projectId))
      .all();
  });

  fastify.get('/api/prs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const pr = database
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.id, id))
      .get();

    if (!pr) {
      await reply.code(404).send({ error: 'Pull request not found' });
      return;
    }

    const orchestrator = fastify.orchestrator;
    const agents = orchestrator
      ? {
          codeFix: orchestrator.hasActiveAgent(id, 'code-fix'),
          insights: orchestrator.hasActiveAgent(id, 'insights'),
        }
      : undefined;

    return { ...pr, agents };
  });

  fastify.put('/api/prs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const updates = request.body as Partial<{
      title: string;
      description: string;
      status: string;
    }>;

    const existing = database
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.id, id))
      .get();

    if (!existing) {
      await reply.code(404).send({ error: 'Pull request not found' });
      return;
    }

    database
      .update(schema.pullRequests)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(eq(schema.pullRequests.id, id))
      .run();

    return database
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.id, id))
      .get();
  });

  fastify.post('/api/prs/:id/review', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { action } = request.body as SubmitReviewInput;

    const pr = database
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.id, id))
      .get();

    if (!pr) {
      await reply.code(404).send({ error: 'Pull request not found' });
      return;
    }

    const latestCycle = getLatestCycle(database, id);
    const now = new Date().toISOString();

    if (action === 'approve') {
      // Set PR status to approved
      database
        .update(schema.pullRequests)
        .set({ status: 'approved', updatedAt: now })
        .where(eq(schema.pullRequests.id, id))
        .run();

      // Set cycle status to approved
      if (latestCycle) {
        database
          .update(schema.reviewCycles)
          .set({ status: 'approved', reviewedAt: now })
          .where(eq(schema.reviewCycles.id, latestCycle.id))
          .run();
      }

      fastify.broadcast('review:submitted', { prId: id, action });

      return { status: 'approved' };
    } else {
      // Set cycle status to changes_requested
      if (latestCycle) {
        database
          .update(schema.reviewCycles)
          .set({ status: 'changes_requested', reviewedAt: now })
          .where(eq(schema.reviewCycles.id, latestCycle.id))
          .run();
      }

      fastify.broadcast('review:submitted', { prId: id, action });

      // Fire and forget: kick off the agent orchestrator
      const orchestrator = fastify.orchestrator;
      if (orchestrator) {
        orchestrator.handleRequestChanges(id).catch((error: unknown) => {
          fastify.log.error(
            { error, prId: id },
            'Orchestrator failed to handle request-changes',
          );
        });
      }

      return { status: 'changes_requested' };
    }
  });

  fastify.post('/api/prs/:id/agent-ready', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { fileGroups } = request.body as {
      fileGroups?: {
        name: string;
        description?: string;
        files: string[];
      }[];
    };

    const pr = database
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.id, id))
      .get();

    if (!pr) {
      await reply.code(404).send({ error: 'Pull request not found' });
      return;
    }

    const latestCycle = getLatestCycle(database, id);
    const now = new Date().toISOString();

    // Check if previous cycle's snapshot had file groups
    if (latestCycle) {
      const previousSnapshot = database
        .select()
        .from(schema.diffSnapshots)
        .where(eq(schema.diffSnapshots.reviewCycleId, latestCycle.id))
        .get();

      if (previousSnapshot?.fileGroups && !fileGroups) {
        await reply.code(400).send({
          error:
            'This PR has file groups from the previous cycle. You must provide --file-groups. Run `shepherd file-groups ' +
            id +
            '` to fetch the current groups and update them.',
        });
        return;
      }
    }

    // Mark current cycle's agentCompletedAt
    if (latestCycle) {
      database
        .update(schema.reviewCycles)
        .set({ agentCompletedAt: now })
        .where(eq(schema.reviewCycles.id, latestCycle.id))
        .run();
    }

    // Look up project for git operations (SHA capture + diff snapshot)
    const project = database
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, pr.projectId))
      .get();

    // Capture commit SHA for the new cycle
    let commitSha: string | undefined;
    if (project) {
      try {
        const gitService = new GitService(project.path);
        commitSha = await gitService.getHeadSha(pr.sourceBranch);
      } catch {
        // Non-fatal
      }
    }

    // Create new review cycle with incremented cycleNumber
    const newCycleNumber = (latestCycle?.cycleNumber ?? 0) + 1;
    const newCycleId = randomUUID();
    database
      .insert(schema.reviewCycles)
      .values({
        id: newCycleId,
        prId: id,
        cycleNumber: newCycleNumber,
        status: 'pending_review',
        commitSha,
      })
      .run();

    const newCycle = database
      .select()
      .from(schema.reviewCycles)
      .where(eq(schema.reviewCycles.id, newCycleId))
      .get();

    if (project) {
      try {
        const gitService = new GitService(project.path);
        const diffData = await gitService.getDiff(
          pr.baseBranch,
          pr.sourceBranch,
        );
        database
          .insert(schema.diffSnapshots)
          .values({
            id: randomUUID(),
            reviewCycleId: newCycleId,
            diffData,
            fileGroups: fileGroups ? JSON.stringify(fileGroups) : undefined,
          })
          .run();
      } catch {
        // Non-fatal: snapshot storage failure should not block agent-ready
        fastify.log.warn(
          { prId: id },
          'Failed to store diff snapshot for new cycle',
        );
      }
    }

    if (newCycle) {
      fastify.broadcast('pr:ready-for-review', {
        prId: id,
        cycleNumber: newCycle.cycleNumber,
      });
    }

    // Send OS notification that PR is ready for review
    fastify.notificationService.notifyPRReadyForReview(
      pr.title,
      project?.name ?? 'Unknown',
    );

    return newCycle;
  });

  fastify.post('/api/prs/:id/resubmit', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { context } = request.body as { context?: string };

    if (!context) {
      await reply.code(400).send({ error: 'Context is required for resubmit' });
      return;
    }

    const pr = database
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.id, id))
      .get();

    if (!pr) {
      await reply.code(404).send({ error: 'Pull request not found' });
      return;
    }

    const latestCycle = getLatestCycle(database, id);
    const now = new Date().toISOString();

    // Mark current cycle as superseded
    if (latestCycle) {
      database
        .update(schema.reviewCycles)
        .set({ status: 'superseded' })
        .where(eq(schema.reviewCycles.id, latestCycle.id))
        .run();
    }

    // Look up project for git operations
    const project = database
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, pr.projectId))
      .get();

    // Capture commit SHA
    let commitSha: string | undefined;
    if (project) {
      try {
        const gitService = new GitService(project.path);
        commitSha = await gitService.getHeadSha(pr.sourceBranch);
      } catch {
        // Non-fatal
      }
    }

    // Create new review cycle
    const newCycleNumber = (latestCycle?.cycleNumber ?? 0) + 1;
    const newCycleId = randomUUID();
    database
      .insert(schema.reviewCycles)
      .values({
        id: newCycleId,
        prId: id,
        cycleNumber: newCycleNumber,
        status: 'pending_review',
        commitSha,
        context,
      })
      .run();

    const newCycle = database
      .select()
      .from(schema.reviewCycles)
      .where(eq(schema.reviewCycles.id, newCycleId))
      .get();

    // Store diff snapshot
    if (project) {
      try {
        const gitService = new GitService(project.path);
        const diffData = await gitService.getDiff(
          pr.baseBranch,
          pr.sourceBranch,
        );
        database
          .insert(schema.diffSnapshots)
          .values({
            id: randomUUID(),
            reviewCycleId: newCycleId,
            diffData,
          })
          .run();
      } catch {
        fastify.log.warn(
          { prId: id },
          'Failed to store diff snapshot for resubmit cycle',
        );
      }
    }

    // Update PR updatedAt
    database
      .update(schema.pullRequests)
      .set({ updatedAt: now })
      .where(eq(schema.pullRequests.id, id))
      .run();

    if (newCycle) {
      fastify.broadcast('pr:ready-for-review', {
        prId: id,
        cycleNumber: newCycle.cycleNumber,
      });
    }

    fastify.notificationService.notifyPRReadyForReview(
      pr.title,
      project?.name ?? 'Unknown',
    );

    return newCycle;
  });

  fastify.post('/api/prs/:id/run-insights', async (request, reply) => {
    const { id } = request.params as { id: string };

    const pr = database
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.id, id))
      .get();

    if (!pr) {
      await reply.code(404).send({ error: 'Pull request not found' });
      return;
    }

    const orchestrator = fastify.orchestrator;
    if (orchestrator) {
      orchestrator.runInsights(id).catch((error: unknown) => {
        fastify.log.error({ error, prId: id }, 'Insights analysis failed');
      });
    }

    return { status: 'insights_started' };
  });

  fastify.post('/api/prs/:id/cancel-agent', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { source } = request.query as { source?: string };

    const pr = database
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.id, id))
      .get();

    if (!pr) {
      await reply.code(404).send({ error: 'Pull request not found' });
      return;
    }

    const orchestrator = fastify.orchestrator;
    if (orchestrator) {
      await orchestrator.cancelAgent(id, source as AgentSource | undefined);
    }

    return { status: 'cancelled' };
  });

  fastify.post('/api/prs/:id/close', async (request, reply) => {
    const { id } = request.params as { id: string };

    const pr = database
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.id, id))
      .get();

    if (!pr) {
      await reply.code(404).send({ error: 'Pull request not found' });
      return;
    }

    if (pr.status !== 'open') {
      await reply
        .code(400)
        .send({ error: `Cannot close a PR with status '${pr.status}'` });
      return;
    }

    const latestCycle = getLatestCycle(database, id);

    if (latestCycle?.status === 'agent_working') {
      await reply
        .code(409)
        .send({ error: 'Agent is currently working. Cancel the agent first.' });
      return;
    }

    const now = new Date().toISOString();
    database
      .update(schema.pullRequests)
      .set({ status: 'closed', updatedAt: now })
      .where(eq(schema.pullRequests.id, id))
      .run();

    const updated = database
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.id, id))
      .get();

    fastify.broadcast('pr:updated', updated);

    return updated;
  });

  fastify.post('/api/prs/:id/reopen', async (request, reply) => {
    const { id } = request.params as { id: string };

    const pr = database
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.id, id))
      .get();

    if (!pr) {
      await reply.code(404).send({ error: 'Pull request not found' });
      return;
    }

    if (pr.status !== 'closed') {
      await reply.code(400).send({ error: 'Only closed PRs can be reopened' });
      return;
    }

    const now = new Date().toISOString();
    database
      .update(schema.pullRequests)
      .set({ status: 'open', updatedAt: now })
      .where(eq(schema.pullRequests.id, id))
      .run();

    const updated = database
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.id, id))
      .get();

    fastify.broadcast('pr:updated', updated);

    return updated;
  });

  fastify.get('/api/prs/:id/cycles', async (request, reply) => {
    const { id } = request.params as { id: string };

    const pr = database
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.id, id))
      .get();

    if (!pr) {
      await reply.code(404).send({ error: 'Pull request not found' });
      return;
    }

    return database
      .select()
      .from(schema.reviewCycles)
      .where(eq(schema.reviewCycles.prId, id))
      .all();
  });
}
