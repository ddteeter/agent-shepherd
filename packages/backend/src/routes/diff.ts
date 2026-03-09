import type { FastifyInstance, FastifyReply } from 'fastify';
import { eq, and, type InferSelectModel } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { schema } from '../db/index.js';
import type { AppDatabase } from '../db/index.js';
import { getLatestCycle } from '../db/queries.js';
import { GitService } from '../services/git.js';
import type { FileGroup } from '@agent-shepherd/shared';

type ReviewCycleRow = InferSelectModel<typeof schema.reviewCycles>;

type PullRequestRow = InferSelectModel<typeof schema.pullRequests>;

async function handleInterCycleDiff(
  database: AppDatabase,
  pr: PullRequestRow,
  id: string,
  from: string,
  to: string,
  reply: FastifyReply,
) {
  const fromNumber = Number.parseInt(from, 10);
  const toNumber = Number.parseInt(to, 10);
  if (
    Number.isNaN(fromNumber) ||
    Number.isNaN(toNumber) ||
    fromNumber < 1 ||
    toNumber < 1
  ) {
    await reply.code(400).send({ error: 'Invalid from/to cycle numbers' });
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
    await reply
      .code(404)
      .send({ error: `Review cycle ${String(fromNumber)} not found` });
    return;
  }
  if (!toCycle) {
    await reply
      .code(404)
      .send({ error: `Review cycle ${String(toNumber)} not found` });
    return;
  }

  if (!fromCycle.commitSha || !toCycle.commitSha) {
    await reply
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
    await reply.code(404).send({ error: 'Project not found' });
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
    fileGroups: undefined,
  };
}

async function handleCycleDiff(
  database: AppDatabase,
  id: string,
  cycle: string,
  reply: FastifyReply,
) {
  const cycleNumber = Number.parseInt(cycle, 10);
  if (Number.isNaN(cycleNumber) || cycleNumber < 1) {
    await reply.code(400).send({ error: 'Invalid cycle number' });
    return;
  }

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
    await reply
      .code(404)
      .send({ error: `Review cycle ${String(cycleNumber)} not found` });
    return;
  }

  const snapshot = database
    .select()
    .from(schema.diffSnapshots)
    .where(eq(schema.diffSnapshots.reviewCycleId, reviewCycle.id))
    .get();

  if (!snapshot) {
    await reply.code(404).send({
      error: `No diff snapshot found for cycle ${String(cycleNumber)}`,
    });
    return;
  }

  const files = extractFilesFromDiff(snapshot.diffData);
  const fileGroups: FileGroup[] | undefined = snapshot.fileGroups
    ? (JSON.parse(snapshot.fileGroups) as FileGroup[])
    : undefined;
  return {
    diff: snapshot.diffData,
    files,
    cycleNumber,
    isSnapshot: true,
    fileGroups,
  };
}

export function diffRoutes(fastify: FastifyInstance) {
  const database = fastify.db;

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
      await reply.code(404).send({ error: 'Pull request not found' });
      return;
    }

    if (from !== undefined && to !== undefined) {
      return handleInterCycleDiff(database, pr, id, from, to, reply);
    }

    if (cycle !== undefined) {
      return handleCycleDiff(database, id, cycle, reply);
    }

    const project = database
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, pr.projectId))
      .get();
    if (!project) {
      await reply.code(404).send({ error: 'Project not found' });
      return;
    }

    const gitService = new GitService(project.path);
    const diff = await gitService.getDiff(pr.baseBranch, pr.sourceBranch);
    const files = await gitService.getChangedFiles(
      pr.baseBranch,
      pr.sourceBranch,
    );

    const latestCycle = getLatestCycle(database, id);
    let fileGroups: FileGroup[] | undefined;
    if (latestCycle) {
      const snapshot = database
        .select()
        .from(schema.diffSnapshots)
        .where(eq(schema.diffSnapshots.reviewCycleId, latestCycle.id))
        .get();
      if (snapshot?.fileGroups) {
        fileGroups = JSON.parse(snapshot.fileGroups) as FileGroup[];
      }
    }

    return { diff, files, fileGroups };
  });

  fastify.get('/api/prs/:id/file-groups', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { cycle } = request.query as { cycle?: string };

    const pr = database
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.id, id))
      .get();
    if (!pr) {
      await reply.code(404).send({ error: 'Pull request not found' });
      return;
    }

    let reviewCycle;
    if (cycle === undefined) {
      reviewCycle = getLatestCycle(database, id);
    } else {
      const cycleNumber = Number.parseInt(cycle, 10);
      if (Number.isNaN(cycleNumber) || cycleNumber < 1) {
        await reply.code(400).send({ error: 'Invalid cycle number' });
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
      await reply.code(404).send({ error: 'Review cycle not found' });
      return;
    }

    const snapshot = database
      .select()
      .from(schema.diffSnapshots)
      .where(eq(schema.diffSnapshots.reviewCycleId, reviewCycle.id))
      .get();

    const fileGroups: FileGroup[] | undefined = snapshot?.fileGroups
      ? (JSON.parse(snapshot.fileGroups) as FileGroup[])
      : undefined;
    return { fileGroups, cycleNumber: reviewCycle.cycleNumber };
  });

  fastify.post('/api/prs/:id/diff/snapshot', async (request, reply) => {
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

    const project = database
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, pr.projectId))
      .get();
    if (!project) {
      await reply.code(404).send({ error: 'Project not found' });
      return;
    }

    const latestCycle = getLatestCycle(database, id);

    if (!latestCycle) {
      await reply.code(404).send({ error: 'No review cycle found' });
      return;
    }

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

    const gitService = new GitService(project.path);
    const diff = await gitService.getDiff(pr.baseBranch, pr.sourceBranch);

    const snapshotId = randomUUID();
    database
      .insert(schema.diffSnapshots)
      .values({
        id: snapshotId,
        reviewCycleId: latestCycle.id,
        diffData: diff,
      })
      .run();

    await reply
      .code(201)
      .send({ id: snapshotId, cycleNumber: latestCycle.cycleNumber });
  });

  fastify.get('/api/prs/:id/cycles/details', async (request, reply) => {
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

    const cycles = database
      .select()
      .from(schema.reviewCycles)
      .where(eq(schema.reviewCycles.prId, id))
      .all();

    const cyclesWithSnapshots = cycles.map((cycle: ReviewCycleRow) => {
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

export function extractFilesFromDiff(diff: string): string[] {
  if (typeof diff !== 'string') return [];
  const files: string[] = [];
  const lines = diff.split('\n');
  for (const line of lines) {
    const match = /^\+\+\+ b\/(.+)$/.exec(line);
    if (match?.[1]) {
      files.push(match[1]);
    }
  }
  return files;
}
