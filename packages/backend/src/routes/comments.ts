import type { FastifyInstance } from 'fastify';
import type {
  CreateCommentInput,
  BatchCommentPayload,
} from '@agent-shepherd/shared';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { schema } from '../db/index.js';
import { extractFilesFromDiff } from './diff.js';

/**
 * Find the latest (current) review cycle for a given PR.
 */
function getCurrentCycleId(database: any, prId: string): string | null {
  const cycles = database
    .select()
    .from(schema.reviewCycles)
    .where(eq(schema.reviewCycles.prId, prId))
    .all();

  const latest = cycles.reduce(
    (best: any, cycle: any) =>
      cycle.cycleNumber > (best?.cycleNumber ?? 0) ? cycle : best,
    null,
  );

  return latest?.id ?? null;
}

export async function commentRoutes(fastify: FastifyInstance) {
  const database = (fastify as any).db;

  // GET /api/projects/:projectId/comments/history — All comments across all PRs for a project
  fastify.get('/api/projects/:projectId/comments/history', async (request) => {
    const { projectId } = request.params as { projectId: string };

    const prs = database
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.projectId, projectId))
      .all();
    const prIds = prs.map((p: any) => p.id);
    if (prIds.length === 0) return [];

    const cycles = database
      .select()
      .from(schema.reviewCycles)
      .where(inArray(schema.reviewCycles.prId, prIds))
      .all();
    const cycleIds = cycles.map((c: any) => c.id);
    if (cycleIds.length === 0) return [];

    const comments = database
      .select()
      .from(schema.comments)
      .where(inArray(schema.comments.reviewCycleId, cycleIds))
      .all();

    const cycleToPr = new Map(cycles.map((c: any) => [c.id, c.prId]));
    return comments.map((c: any) => ({
      ...c,
      prId: cycleToPr.get(c.reviewCycleId) ?? null,
    }));
  });

  // POST /api/prs/:prId/comments — Add a comment to the current review cycle
  fastify.post('/api/prs/:prId/comments', async (request, reply) => {
    const { prId } = request.params as { prId: string };
    const {
      filePath,
      startLine,
      endLine,
      body,
      severity,
      author,
      parentCommentId,
    } = request.body as CreateCommentInput;

    const reviewCycleId = getCurrentCycleId(database, prId);
    if (!reviewCycleId) {
      reply.code(404).send({ error: 'No review cycle found for this PR' });
      return;
    }

    const id = randomUUID();
    database.insert(schema.comments)
      .values({
        id,
        reviewCycleId,
        filePath: filePath ?? null,
        startLine: startLine ?? null,
        endLine: endLine ?? null,
        body,
        severity: severity || 'suggestion',
        author,
        parentCommentId: parentCommentId || null,
      })
      .run();

    const comment = database
      .select()
      .from(schema.comments)
      .where(eq(schema.comments.id, id))
      .get();

    const broadcast = (fastify as any).broadcast;
    if (broadcast) broadcast('comment:added', comment);

    // Auto-unresolve parent if it was resolved
    if (parentCommentId) {
      const parent = database
        .select()
        .from(schema.comments)
        .where(eq(schema.comments.id, parentCommentId))
        .get();
      if (parent?.resolved) {
        database.update(schema.comments)
          .set({ resolved: false })
          .where(eq(schema.comments.id, parentCommentId))
          .run();
        const updatedParent = database
          .select()
          .from(schema.comments)
          .where(eq(schema.comments.id, parentCommentId))
          .get();
        const broadcast = (fastify as any).broadcast;
        if (broadcast) broadcast('comment:updated', updatedParent);
      }
    }

    reply.code(201).send(comment);
  });

  // GET /api/prs/:prId/comments — List all comments across all cycles for a PR
  fastify.get('/api/prs/:prId/comments', async (request) => {
    const { prId } = request.params as { prId: string };
    const { filePath, severity, summary } = request.query as {
      filePath?: string;
      severity?: string;
      summary?: string;
    };

    // Get all review cycle IDs for this PR
    const cycles = database
      .select()
      .from(schema.reviewCycles)
      .where(eq(schema.reviewCycles.prId, prId))
      .all();

    const cycleIds = cycles.map((c: any) => c.id);

    if (cycleIds.length === 0) {
      if (summary === 'true') {
        return { total: 0, bySeverity: {}, files: [], generalCount: 0 };
      }
      return [];
    }

    const allComments = database
      .select()
      .from(schema.comments)
      .where(inArray(schema.comments.reviewCycleId, cycleIds))
      .all();

    // Summary mode: return aggregated stats from all unresolved top-level comments
    if (summary === 'true') {
      const topLevel = allComments.filter(
        (c: any) => !c.parentCommentId && !c.resolved,
      );

      const bySeverity: Record<string, number> = {};
      const fileMap: Record<
        string,
        { count: number; bySeverity: Record<string, number> }
      > = {};
      let generalCount = 0;

      for (const c of topLevel) {
        // Count by severity
        bySeverity[c.severity] = (bySeverity[c.severity] || 0) + 1;

        if (c.filePath) {
          // File-specific comment
          if (!fileMap[c.filePath]) {
            fileMap[c.filePath] = { count: 0, bySeverity: {} };
          }
          fileMap[c.filePath].count++;
          fileMap[c.filePath].bySeverity[c.severity] =
            (fileMap[c.filePath].bySeverity[c.severity] || 0) + 1;
        } else {
          // General (no-file) comment
          generalCount++;
        }
      }

      // Try to get diff file ordering from latest cycle's snapshot
      let diffFileOrder: string[] | null = null;
      const latestCycle = cycles.reduce(
        (best: any, cycle: any) =>
          cycle.cycleNumber > (best?.cycleNumber ?? 0) ? cycle : best,
        null,
      );
      if (latestCycle) {
        const snapshot = database
          .select()
          .from(schema.diffSnapshots)
          .where(eq(schema.diffSnapshots.reviewCycleId, latestCycle.id))
          .get();
        if (snapshot) {
          diffFileOrder = extractFilesFromDiff(snapshot.diffData);
        }
      }

      // Sort files by diff order (or alphabetical fallback)
      const filePaths = Object.keys(fileMap);
      if (diffFileOrder) {
        const orderMap = new Map(diffFileOrder.map((f, index) => [f, index]));
        filePaths.sort((a, b) => {
          const ai = orderMap.get(a) ?? Infinity;
          const bi = orderMap.get(b) ?? Infinity;
          if (ai !== bi) return ai - bi;
          return a.localeCompare(b);
        });
      } else {
        filePaths.sort((a, b) => a.localeCompare(b));
      }

      const files = filePaths.map((path) => ({
        path,
        count: fileMap[path].count,
        bySeverity: fileMap[path].bySeverity,
      }));

      return {
        total: topLevel.length,
        bySeverity,
        files,
        generalCount,
      };
    }

    // Non-summary mode: return filtered comments
    let comments = allComments;

    if (filePath) {
      comments = comments.filter((c: any) => c.filePath === filePath);
    }
    if (severity) {
      comments = comments.filter((c: any) => c.severity === severity);
    }

    return comments;
  });

  // PUT /api/comments/:id — Update a comment (body, resolved)
  fastify.put('/api/comments/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const updates = request.body as Partial<{
      body: string;
      resolved: boolean;
    }>;

    const existing = database
      .select()
      .from(schema.comments)
      .where(eq(schema.comments.id, id))
      .get();

    if (!existing) {
      reply.code(404).send({ error: 'Comment not found' });
      return;
    }

    database.update(schema.comments)
      .set(updates)
      .where(eq(schema.comments.id, id))
      .run();

    return database
      .select()
      .from(schema.comments)
      .where(eq(schema.comments.id, id))
      .get();
  });

  // DELETE /api/comments/:id — Delete a comment
  fastify.delete('/api/comments/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = database
      .select()
      .from(schema.comments)
      .where(eq(schema.comments.id, id))
      .get();

    if (!existing) {
      reply.code(404).send({ error: 'Comment not found' });
      return;
    }

    database.delete(schema.comments).where(eq(schema.comments.id, id)).run();

    reply.code(204).send();
  });

  // POST /api/prs/:prId/comments/batch — Batch create comments and replies
  fastify.post('/api/prs/:prId/comments/batch', async (request, reply) => {
    const { prId } = request.params as { prId: string };
    const { comments, replies } = request.body as BatchCommentPayload;

    const reviewCycleId = getCurrentCycleId(database, prId);
    if (!reviewCycleId) {
      reply.code(404).send({ error: 'No review cycle found for this PR' });
      return;
    }

    let created = 0;

    const broadcast = (fastify as any).broadcast;

    // Create new comments (default author = 'agent')
    for (const c of comments) {
      const id = randomUUID();
      database.insert(schema.comments)
        .values({
          id,
          reviewCycleId,
          filePath: c.filePath ?? null,
          startLine: c.startLine ?? null,
          endLine: c.endLine ?? null,
          body: c.body,
          severity: c.severity || 'suggestion',
          author: 'agent',
        })
        .run();

      if (broadcast) {
        const comment = database
          .select()
          .from(schema.comments)
          .where(eq(schema.comments.id, id))
          .get();
        broadcast('comment:added', comment);
      }
      created++;
    }

    // Create replies (inherit filePath/startLine/endLine from parent)
    if (replies) {
      for (const r of replies) {
        const parent = database
          .select()
          .from(schema.comments)
          .where(eq(schema.comments.id, r.parentCommentId))
          .get();

        if (parent) {
          const id = randomUUID();
          database.insert(schema.comments)
            .values({
              id,
              reviewCycleId,
              filePath: parent.filePath ?? null,
              startLine: parent.startLine ?? null,
              endLine: parent.endLine ?? null,
              body: r.body,
              severity: r.severity || 'suggestion',
              author: 'agent',
              parentCommentId: r.parentCommentId,
            })
            .run();

          if (broadcast) {
            const reply = database
              .select()
              .from(schema.comments)
              .where(eq(schema.comments.id, id))
              .get();
            broadcast('comment:added', reply);
          }
          created++;

          // Auto-unresolve parent if resolved
          if (parent.resolved) {
            database.update(schema.comments)
              .set({ resolved: false })
              .where(eq(schema.comments.id, r.parentCommentId))
              .run();
            if (broadcast)
              broadcast('comment:updated', { ...parent, resolved: false });
          }
        }
      }
    }

    reply.code(201).send({ created });
  });
}
