import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { schema } from '../db/index.js';
import { getLatestCycle } from '../db/queries.js';
import { GitService } from '../services/git.js';

export async function diffRoutes(fastify: FastifyInstance) {
  const db = (fastify as any).db;

  // GET /api/prs/:id/diff — Get diff for a PR
  // Query params:
  //   (none)    — live diff: base branch vs source branch
  //   ?cycle=N  — stored diff snapshot for cycle N
  fastify.get('/api/prs/:id/diff', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { cycle, from, to } = request.query as { cycle?: string; from?: string; to?: string };

    const pr = db.select().from(schema.pullRequests).where(eq(schema.pullRequests.id, id)).get();
    if (!pr) {
      reply.code(404).send({ error: 'Pull request not found' });
      return;
    }

    // Inter-cycle diff: from=N&to=M
    if (from !== undefined && to !== undefined) {
      const fromNum = parseInt(from, 10);
      const toNum = parseInt(to, 10);
      if (isNaN(fromNum) || isNaN(toNum) || fromNum < 1 || toNum < 1) {
        reply.code(400).send({ error: 'Invalid from/to cycle numbers' });
        return;
      }

      const fromCycle = db
        .select()
        .from(schema.reviewCycles)
        .where(and(eq(schema.reviewCycles.prId, id), eq(schema.reviewCycles.cycleNumber, fromNum)))
        .get();
      const toCycle = db
        .select()
        .from(schema.reviewCycles)
        .where(and(eq(schema.reviewCycles.prId, id), eq(schema.reviewCycles.cycleNumber, toNum)))
        .get();

      if (!fromCycle) {
        reply.code(404).send({ error: `Review cycle ${fromNum} not found` });
        return;
      }
      if (!toCycle) {
        reply.code(404).send({ error: `Review cycle ${toNum} not found` });
        return;
      }

      if (!fromCycle.commitSha || !toCycle.commitSha) {
        reply.code(400).send({ error: 'Commit SHAs not available for these cycles' });
        return;
      }

      const project = db.select().from(schema.projects).where(eq(schema.projects.id, pr.projectId)).get();
      if (!project) {
        reply.code(404).send({ error: 'Project not found' });
        return;
      }

      const gitService = new GitService(project.path);
      const diff = await gitService.getDiffBetweenCommits(fromCycle.commitSha, toCycle.commitSha);
      const files = extractFilesFromDiff(diff);
      return { diff, files, fromCycle: fromNum, toCycle: toNum, isInterCycleDiff: true };
    }

    // If cycle param is provided, return stored snapshot
    if (cycle !== undefined) {
      const cycleNumber = parseInt(cycle, 10);
      if (isNaN(cycleNumber) || cycleNumber < 1) {
        reply.code(400).send({ error: 'Invalid cycle number' });
        return;
      }

      // Find the review cycle
      const reviewCycle = db
        .select()
        .from(schema.reviewCycles)
        .where(and(eq(schema.reviewCycles.prId, id), eq(schema.reviewCycles.cycleNumber, cycleNumber)))
        .get();

      if (!reviewCycle) {
        reply.code(404).send({ error: `Review cycle ${cycleNumber} not found` });
        return;
      }

      // Find the diff snapshot for this cycle
      const snapshot = db
        .select()
        .from(schema.diffSnapshots)
        .where(eq(schema.diffSnapshots.reviewCycleId, reviewCycle.id))
        .get();

      if (!snapshot) {
        reply.code(404).send({ error: `No diff snapshot found for cycle ${cycleNumber}` });
        return;
      }

      // Parse stored files from the diff data (extract file names from unified diff)
      const files = extractFilesFromDiff(snapshot.diffData);
      return { diff: snapshot.diffData, files, cycleNumber, isSnapshot: true };
    }

    // Default: live diff
    const project = db.select().from(schema.projects).where(eq(schema.projects.id, pr.projectId)).get();
    if (!project) {
      reply.code(404).send({ error: 'Project not found' });
      return;
    }

    const gitService = new GitService(project.path);
    const diff = await gitService.getDiff(pr.baseBranch, pr.sourceBranch);
    const files = await gitService.getChangedFiles(pr.baseBranch, pr.sourceBranch);

    return { diff, files };
  });

  // POST /api/prs/:id/diff/snapshot — Store a diff snapshot for the current (latest) cycle
  fastify.post('/api/prs/:id/diff/snapshot', async (request, reply) => {
    const { id } = request.params as { id: string };

    const pr = db.select().from(schema.pullRequests).where(eq(schema.pullRequests.id, id)).get();
    if (!pr) {
      reply.code(404).send({ error: 'Pull request not found' });
      return;
    }

    const project = db.select().from(schema.projects).where(eq(schema.projects.id, pr.projectId)).get();
    if (!project) {
      reply.code(404).send({ error: 'Project not found' });
      return;
    }

    const latestCycle = getLatestCycle(db, id);

    if (!latestCycle) {
      reply.code(404).send({ error: 'No review cycle found' });
      return;
    }

    // Check if snapshot already exists for this cycle
    const existing = db
      .select()
      .from(schema.diffSnapshots)
      .where(eq(schema.diffSnapshots.reviewCycleId, latestCycle.id))
      .get();

    if (existing) {
      return { id: existing.id, cycleNumber: latestCycle.cycleNumber, alreadyExists: true };
    }

    // Get live diff and store it
    const gitService = new GitService(project.path);
    const diff = await gitService.getDiff(pr.baseBranch, pr.sourceBranch);

    const snapshotId = randomUUID();
    db.insert(schema.diffSnapshots)
      .values({
        id: snapshotId,
        reviewCycleId: latestCycle.id,
        diffData: diff,
      })
      .run();

    reply.code(201).send({ id: snapshotId, cycleNumber: latestCycle.cycleNumber });
  });

  // GET /api/prs/:id/cycles — List review cycles with snapshot availability
  // (This enhances the existing cycles endpoint in pull-requests.ts by adding snapshot info)
  fastify.get('/api/prs/:id/cycles/details', async (request, reply) => {
    const { id } = request.params as { id: string };

    const pr = db.select().from(schema.pullRequests).where(eq(schema.pullRequests.id, id)).get();
    if (!pr) {
      reply.code(404).send({ error: 'Pull request not found' });
      return;
    }

    const cycles = db
      .select()
      .from(schema.reviewCycles)
      .where(eq(schema.reviewCycles.prId, id))
      .all();

    // For each cycle, check if a diff snapshot exists
    const cyclesWithSnapshots = cycles.map((cycle: any) => {
      const snapshot = db
        .select()
        .from(schema.diffSnapshots)
        .where(eq(schema.diffSnapshots.reviewCycleId, cycle.id))
        .get();

      return {
        ...cycle,
        hasDiffSnapshot: !!snapshot,
      };
    });

    return cyclesWithSnapshots;
  });
}

/** Extract file paths from a unified diff string */
function extractFilesFromDiff(diff: string): string[] {
  const files: string[] = [];
  const lines = diff.split('\n');
  for (const line of lines) {
    // Match "diff --git a/path b/path" or "+++ b/path"
    const match = line.match(/^\+\+\+ b\/(.+)$/);
    if (match && match[1]) {
      files.push(match[1]);
    }
  }
  return files;
}
