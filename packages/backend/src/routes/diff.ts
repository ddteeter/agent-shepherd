import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { schema } from '../db/index.js';
import { getLatestCycle } from '../db/queries.js';
import { GitService } from '../services/git.js';

export async function diffRoutes(fastify: FastifyInstance) {
  const database = (fastify as any).db;

  // GET /api/prs/:id/diff — Get diff for a PR
  // Query params:
  //   (none)    — live diff: base branch vs source branch
  //   ?cycle=N  — stored diff snapshot for cycle N
  fastify.get('/api/prs/:id/diff', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { cycle, from, to } = request.query as {
      cycle?: string;
      from?: string;
      to?: string;
    };

    const pr = database
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.id, id))
      .get();
    if (!pr) {
      reply.code(404).send({ error: 'Pull request not found' });
      return;
    }

    // Inter-cycle diff: from=N&to=M
    if (from !== undefined && to !== undefined) {
      const fromNumber = Number.parseInt(from, 10);
      const toNumber = Number.parseInt(to, 10);
      if (isNaN(fromNumber) || isNaN(toNumber) || fromNumber < 1 || toNumber < 1) {
        reply.code(400).send({ error: 'Invalid from/to cycle numbers' });
        return;
      }

      const fromCycle = database
        .select()
        .from(schema.reviewCycles)
        .where(
          and(
            eq(schema.reviewCycles.prId, id),
            eq(schema.reviewCycles.cycleNumber, fromNumber),
          ),
        )
        .get();
      const toCycle = database
        .select()
        .from(schema.reviewCycles)
        .where(
          and(
            eq(schema.reviewCycles.prId, id),
            eq(schema.reviewCycles.cycleNumber, toNumber),
          ),
        )
        .get();

      if (!fromCycle) {
        reply.code(404).send({ error: `Review cycle ${fromNumber} not found` });
        return;
      }
      if (!toCycle) {
        reply.code(404).send({ error: `Review cycle ${toNumber} not found` });
        return;
      }

      if (!fromCycle.commitSha || !toCycle.commitSha) {
        reply
          .code(400)
          .send({ error: 'Commit SHAs not available for these cycles' });
        return;
      }

      const project = database
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, pr.projectId))
        .get();
      if (!project) {
        reply.code(404).send({ error: 'Project not found' });
        return;
      }

      const gitService = new GitService(project.path);
      const diff = await gitService.getDiffBetweenCommits(
        fromCycle.commitSha,
        toCycle.commitSha,
      );
      const files = extractFilesFromDiff(diff);
      return {
        diff,
        files,
        fromCycle: fromNumber,
        toCycle: toNumber,
        isInterCycleDiff: true,
        fileGroups: null,
      };
    }

    // If cycle param is provided, return stored snapshot
    if (cycle !== undefined) {
      const cycleNumber = Number.parseInt(cycle, 10);
      if (isNaN(cycleNumber) || cycleNumber < 1) {
        reply.code(400).send({ error: 'Invalid cycle number' });
        return;
      }

      // Find the review cycle
      const reviewCycle = database
        .select()
        .from(schema.reviewCycles)
        .where(
          and(
            eq(schema.reviewCycles.prId, id),
            eq(schema.reviewCycles.cycleNumber, cycleNumber),
          ),
        )
        .get();

      if (!reviewCycle) {
        reply
          .code(404)
          .send({ error: `Review cycle ${cycleNumber} not found` });
        return;
      }

      // Find the diff snapshot for this cycle
      const snapshot = database
        .select()
        .from(schema.diffSnapshots)
        .where(eq(schema.diffSnapshots.reviewCycleId, reviewCycle.id))
        .get();

      if (!snapshot) {
        reply
          .code(404)
          .send({ error: `No diff snapshot found for cycle ${cycleNumber}` });
        return;
      }

      // Parse stored files from the diff data (extract file names from unified diff)
      const files = extractFilesFromDiff(snapshot.diffData);
      const fileGroups = snapshot.fileGroups
        ? JSON.parse(snapshot.fileGroups as string)
        : null;
      return {
        diff: snapshot.diffData,
        files,
        cycleNumber,
        isSnapshot: true,
        fileGroups,
      };
    }

    // Default: live diff
    const project = database
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, pr.projectId))
      .get();
    if (!project) {
      reply.code(404).send({ error: 'Project not found' });
      return;
    }

    const gitService = new GitService(project.path);
    const diff = await gitService.getDiff(pr.baseBranch, pr.sourceBranch);
    const files = await gitService.getChangedFiles(
      pr.baseBranch,
      pr.sourceBranch,
    );

    // Look up file groups from the latest cycle's snapshot
    const latestCycle = getLatestCycle(database, id);
    let fileGroups = null;
    if (latestCycle) {
      const snapshot = database
        .select()
        .from(schema.diffSnapshots)
        .where(eq(schema.diffSnapshots.reviewCycleId, latestCycle.id))
        .get();
      if (snapshot?.fileGroups) {
        fileGroups = JSON.parse(snapshot.fileGroups as string);
      }
    }

    return { diff, files, fileGroups };
  });

  // GET /api/prs/:id/file-groups — Get file groups for a PR cycle
  fastify.get('/api/prs/:id/file-groups', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { cycle } = request.query as { cycle?: string };

    const pr = database
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.id, id))
      .get();
    if (!pr) {
      reply.code(404).send({ error: 'Pull request not found' });
      return;
    }

    let reviewCycle;
    if (cycle === undefined) {
      reviewCycle = getLatestCycle(database, id);
    } else {
      const cycleNumber = Number.parseInt(cycle, 10);
      if (isNaN(cycleNumber) || cycleNumber < 1) {
        reply.code(400).send({ error: 'Invalid cycle number' });
        return;
      }
      reviewCycle = database
        .select()
        .from(schema.reviewCycles)
        .where(
          and(
            eq(schema.reviewCycles.prId, id),
            eq(schema.reviewCycles.cycleNumber, cycleNumber),
          ),
        )
        .get();
    }

    if (!reviewCycle) {
      reply.code(404).send({ error: 'Review cycle not found' });
      return;
    }

    const snapshot = database
      .select()
      .from(schema.diffSnapshots)
      .where(eq(schema.diffSnapshots.reviewCycleId, reviewCycle.id))
      .get();

    const fileGroups = snapshot?.fileGroups
      ? JSON.parse(snapshot.fileGroups as string)
      : null;
    return { fileGroups, cycleNumber: reviewCycle.cycleNumber };
  });

  // POST /api/prs/:id/diff/snapshot — Store a diff snapshot for the current (latest) cycle
  fastify.post('/api/prs/:id/diff/snapshot', async (request, reply) => {
    const { id } = request.params as { id: string };

    const pr = database
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.id, id))
      .get();
    if (!pr) {
      reply.code(404).send({ error: 'Pull request not found' });
      return;
    }

    const project = database
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, pr.projectId))
      .get();
    if (!project) {
      reply.code(404).send({ error: 'Project not found' });
      return;
    }

    const latestCycle = getLatestCycle(database, id);

    if (!latestCycle) {
      reply.code(404).send({ error: 'No review cycle found' });
      return;
    }

    // Check if snapshot already exists for this cycle
    const existing = database
      .select()
      .from(schema.diffSnapshots)
      .where(eq(schema.diffSnapshots.reviewCycleId, latestCycle.id))
      .get();

    if (existing) {
      return {
        id: existing.id,
        cycleNumber: latestCycle.cycleNumber,
        alreadyExists: true,
      };
    }

    // Get live diff and store it
    const gitService = new GitService(project.path);
    const diff = await gitService.getDiff(pr.baseBranch, pr.sourceBranch);

    const snapshotId = randomUUID();
    database.insert(schema.diffSnapshots)
      .values({
        id: snapshotId,
        reviewCycleId: latestCycle.id,
        diffData: diff,
      })
      .run();

    reply
      .code(201)
      .send({ id: snapshotId, cycleNumber: latestCycle.cycleNumber });
  });

  // GET /api/prs/:id/cycles — List review cycles with snapshot availability
  // (This enhances the existing cycles endpoint in pull-requests.ts by adding snapshot info)
  fastify.get('/api/prs/:id/cycles/details', async (request, reply) => {
    const { id } = request.params as { id: string };

    const pr = database
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.id, id))
      .get();
    if (!pr) {
      reply.code(404).send({ error: 'Pull request not found' });
      return;
    }

    const cycles = database
      .select()
      .from(schema.reviewCycles)
      .where(eq(schema.reviewCycles.prId, id))
      .all();

    // For each cycle, check if a diff snapshot exists
    const cyclesWithSnapshots = cycles.map((cycle: any) => {
      const snapshot = database
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
export function extractFilesFromDiff(diff: string): string[] {
  if (typeof diff !== 'string') return [];
  const files: string[] = [];
  const lines = diff.split('\n');
  for (const line of lines) {
    // Match "diff --git a/path b/path" or "+++ b/path"
    const match = /^\+\+\+ b\/(.+)$/.exec(line);
    if (match && match[1]) {
      files.push(match[1]);
    }
  }
  return files;
}
