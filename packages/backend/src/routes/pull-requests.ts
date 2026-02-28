import type { FastifyInstance } from 'fastify';
import type { CreatePRInput, SubmitReviewInput } from '@agent-shepherd/shared';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { schema } from '../db/index.js';
import { getLatestCycle } from '../db/queries.js';
import { GitService } from '../services/git.js';
import { NotificationService } from '../services/notifications.js';

export async function pullRequestRoutes(fastify: FastifyInstance) {
  const db = (fastify as any).db;

  fastify.post('/api/projects/:projectId/prs', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const { title, description, sourceBranch, baseBranch, workingDirectory } = request.body as Omit<CreatePRInput, 'projectId'>;

    // Verify project exists
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get();

    if (!project) {
      reply.code(404).send({ error: 'Project not found' });
      return;
    }

    const prId = randomUUID();
    db.insert(schema.pullRequests)
      .values({
        id: prId,
        projectId,
        title,
        description: description || '',
        sourceBranch,
        baseBranch: baseBranch || project.baseBranch || 'main',
        status: 'open',
        workingDirectory: workingDirectory || null,
      })
      .run();

    // Try to capture commit SHA for the initial cycle
    let commitSha: string | null = null;
    try {
      const gitService = new GitService(project.path);
      commitSha = await gitService.getHeadSha(sourceBranch);
    } catch {
      // Non-fatal: SHA capture may fail if branch doesn't exist locally
    }

    // Create first review cycle
    const cycleId = randomUUID();
    db.insert(schema.reviewCycles)
      .values({
        id: cycleId,
        prId,
        cycleNumber: 1,
        status: 'pending_review',
        commitSha,
      })
      .run();

    const pr = db
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.id, prId))
      .get();

    const broadcast = (fastify as any).broadcast;
    if (broadcast) broadcast('pr:created', pr);

    reply.code(201).send(pr);
  });

  fastify.get('/api/projects/:projectId/prs', async (request) => {
    const { projectId } = request.params as { projectId: string };
    return db
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.projectId, projectId))
      .all();
  });

  fastify.get('/api/prs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const pr = db
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.id, id))
      .get();

    if (!pr) {
      reply.code(404).send({ error: 'Pull request not found' });
      return;
    }
    return pr;
  });

  fastify.put('/api/prs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const updates = request.body as Partial<{
      title: string;
      description: string;
      status: string;
    }>;

    const existing = db
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.id, id))
      .get();

    if (!existing) {
      reply.code(404).send({ error: 'Pull request not found' });
      return;
    }

    db.update(schema.pullRequests)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(eq(schema.pullRequests.id, id))
      .run();

    return db
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.id, id))
      .get();
  });

  fastify.post('/api/prs/:id/review', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { action } = request.body as SubmitReviewInput;

    const pr = db
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.id, id))
      .get();

    if (!pr) {
      reply.code(404).send({ error: 'Pull request not found' });
      return;
    }

    const latestCycle = getLatestCycle(db, id);
    const now = new Date().toISOString();

    if (action === 'approve') {
      // Set PR status to approved
      db.update(schema.pullRequests)
        .set({ status: 'approved', updatedAt: now })
        .where(eq(schema.pullRequests.id, id))
        .run();

      // Set cycle status to approved
      if (latestCycle) {
        db.update(schema.reviewCycles)
          .set({ status: 'approved', reviewedAt: now })
          .where(eq(schema.reviewCycles.id, latestCycle.id))
          .run();
      }

      const broadcast = (fastify as any).broadcast;
      if (broadcast) broadcast('review:submitted', { prId: id, action });

      return { status: 'approved' };
    } else if (action === 'request-changes') {
      // Set cycle status to changes_requested
      if (latestCycle) {
        db.update(schema.reviewCycles)
          .set({ status: 'changes_requested', reviewedAt: now })
          .where(eq(schema.reviewCycles.id, latestCycle.id))
          .run();
      }

      const broadcast = (fastify as any).broadcast;
      if (broadcast) broadcast('review:submitted', { prId: id, action });

      // Fire and forget: kick off the agent orchestrator
      const orchestrator = (fastify as any).orchestrator;
      if (orchestrator) {
        orchestrator.handleRequestChanges(id).catch((err: Error) => {
          fastify.log.error({ err, prId: id }, 'Orchestrator failed to handle request-changes');
        });
      }

      return { status: 'changes_requested' };
    }

    reply.code(400).send({ error: 'Invalid action' });
  });

  fastify.post('/api/prs/:id/agent-ready', async (request, reply) => {
    const { id } = request.params as { id: string };

    const pr = db
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.id, id))
      .get();

    if (!pr) {
      reply.code(404).send({ error: 'Pull request not found' });
      return;
    }

    const latestCycle = getLatestCycle(db, id);
    const now = new Date().toISOString();

    // Mark current cycle's agentCompletedAt
    if (latestCycle) {
      db.update(schema.reviewCycles)
        .set({ agentCompletedAt: now })
        .where(eq(schema.reviewCycles.id, latestCycle.id))
        .run();
    }

    // Look up project for git operations (SHA capture + diff snapshot)
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, pr.projectId))
      .get();

    // Capture commit SHA for the new cycle
    let commitSha: string | null = null;
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
    db.insert(schema.reviewCycles)
      .values({
        id: newCycleId,
        prId: id,
        cycleNumber: newCycleNumber,
        status: 'pending_review',
        commitSha,
      })
      .run();

    const newCycle = db
      .select()
      .from(schema.reviewCycles)
      .where(eq(schema.reviewCycles.id, newCycleId))
      .get();

    if (project) {
      try {
        const gitService = new GitService(project.path);
        const diffData = await gitService.getDiff(pr.baseBranch, pr.sourceBranch);
        db.insert(schema.diffSnapshots)
          .values({
            id: randomUUID(),
            reviewCycleId: newCycleId,
            diffData,
          })
          .run();
      } catch {
        // Non-fatal: snapshot storage failure should not block agent-ready
        fastify.log.warn({ prId: id }, 'Failed to store diff snapshot for new cycle');
      }
    }

    const broadcast = (fastify as any).broadcast;
    if (broadcast) broadcast('pr:ready-for-review', { prId: id, cycleNumber: newCycle.cycleNumber });

    // Send OS notification that PR is ready for review
    const notificationService: NotificationService | undefined =
      (fastify as any).notificationService;
    if (notificationService) {
      notificationService.notifyPRReadyForReview(pr.title, project?.name ?? 'Unknown');
    }

    return newCycle;
  });

  fastify.post('/api/prs/:id/cancel-agent', async (request, reply) => {
    const { id } = request.params as { id: string };

    const pr = db
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.id, id))
      .get();

    if (!pr) {
      reply.code(404).send({ error: 'Pull request not found' });
      return;
    }

    const orchestrator = (fastify as any).orchestrator;
    if (orchestrator) {
      await orchestrator.cancelAgent(id);
    }

    return { status: 'cancelled' };
  });

  fastify.post('/api/prs/:id/close', async (request, reply) => {
    const { id } = request.params as { id: string };

    const pr = db
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.id, id))
      .get();

    if (!pr) {
      reply.code(404).send({ error: 'Pull request not found' });
      return;
    }

    if (pr.status !== 'open') {
      reply.code(400).send({ error: `Cannot close a PR with status '${pr.status}'` });
      return;
    }

    const latestCycle = getLatestCycle(db, id);

    if (latestCycle?.status === 'agent_working') {
      reply.code(409).send({ error: 'Agent is currently working. Cancel the agent first.' });
      return;
    }

    const now = new Date().toISOString();
    db.update(schema.pullRequests)
      .set({ status: 'closed', updatedAt: now })
      .where(eq(schema.pullRequests.id, id))
      .run();

    const updated = db
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.id, id))
      .get();

    const broadcast = (fastify as any).broadcast;
    if (broadcast) broadcast('pr:updated', updated);

    return updated;
  });

  fastify.post('/api/prs/:id/reopen', async (request, reply) => {
    const { id } = request.params as { id: string };

    const pr = db
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.id, id))
      .get();

    if (!pr) {
      reply.code(404).send({ error: 'Pull request not found' });
      return;
    }

    if (pr.status !== 'closed') {
      reply.code(400).send({ error: 'Only closed PRs can be reopened' });
      return;
    }

    const now = new Date().toISOString();
    db.update(schema.pullRequests)
      .set({ status: 'open', updatedAt: now })
      .where(eq(schema.pullRequests.id, id))
      .run();

    const updated = db
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.id, id))
      .get();

    const broadcast = (fastify as any).broadcast;
    if (broadcast) broadcast('pr:updated', updated);

    return updated;
  });

  fastify.get('/api/prs/:id/cycles', async (request, reply) => {
    const { id } = request.params as { id: string };

    const pr = db
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.id, id))
      .get();

    if (!pr) {
      reply.code(404).send({ error: 'Pull request not found' });
      return;
    }

    return db
      .select()
      .from(schema.reviewCycles)
      .where(eq(schema.reviewCycles.prId, id))
      .all();
  });
}
