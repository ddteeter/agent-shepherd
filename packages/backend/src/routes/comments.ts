import type { FastifyInstance } from 'fastify';
import type { CreateCommentInput, BatchCommentPayload } from '@agent-shepherd/shared';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { schema } from '../db/index.js';

/**
 * Find the latest (current) review cycle for a given PR.
 */
function getCurrentCycleId(db: any, prId: string): string | null {
  const cycles = db
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
  const db = (fastify as any).db;

  // POST /api/prs/:prId/comments — Add a comment to the current review cycle
  fastify.post('/api/prs/:prId/comments', async (request, reply) => {
    const { prId } = request.params as { prId: string };
    const { filePath, startLine, endLine, body, severity, author, parentCommentId } =
      request.body as CreateCommentInput;

    const reviewCycleId = getCurrentCycleId(db, prId);
    if (!reviewCycleId) {
      reply.code(404).send({ error: 'No review cycle found for this PR' });
      return;
    }

    const id = randomUUID();
    db.insert(schema.comments)
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

    const comment = db
      .select()
      .from(schema.comments)
      .where(eq(schema.comments.id, id))
      .get();

    const broadcast = (fastify as any).broadcast;
    if (broadcast) broadcast('comment:added', comment);

    reply.code(201).send(comment);
  });

  // GET /api/prs/:prId/comments — List all comments across all cycles for a PR
  fastify.get('/api/prs/:prId/comments', async (request) => {
    const { prId } = request.params as { prId: string };

    // Get all review cycle IDs for this PR
    const cycles = db
      .select()
      .from(schema.reviewCycles)
      .where(eq(schema.reviewCycles.prId, prId))
      .all();

    const cycleIds = cycles.map((c: any) => c.id);

    if (cycleIds.length === 0) return [];

    return db.select().from(schema.comments).where(inArray(schema.comments.reviewCycleId, cycleIds)).all();
  });

  // PUT /api/comments/:id — Update a comment (body, resolved)
  fastify.put('/api/comments/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const updates = request.body as Partial<{
      body: string;
      resolved: boolean;
    }>;

    const existing = db
      .select()
      .from(schema.comments)
      .where(eq(schema.comments.id, id))
      .get();

    if (!existing) {
      reply.code(404).send({ error: 'Comment not found' });
      return;
    }

    db.update(schema.comments)
      .set(updates)
      .where(eq(schema.comments.id, id))
      .run();

    return db
      .select()
      .from(schema.comments)
      .where(eq(schema.comments.id, id))
      .get();
  });

  // DELETE /api/comments/:id — Delete a comment
  fastify.delete('/api/comments/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = db
      .select()
      .from(schema.comments)
      .where(eq(schema.comments.id, id))
      .get();

    if (!existing) {
      reply.code(404).send({ error: 'Comment not found' });
      return;
    }

    db.delete(schema.comments)
      .where(eq(schema.comments.id, id))
      .run();

    reply.code(204).send();
  });

  // POST /api/prs/:prId/comments/batch — Batch create comments and replies
  fastify.post('/api/prs/:prId/comments/batch', async (request, reply) => {
    const { prId } = request.params as { prId: string };
    const { comments, replies } = request.body as BatchCommentPayload;

    const reviewCycleId = getCurrentCycleId(db, prId);
    if (!reviewCycleId) {
      reply.code(404).send({ error: 'No review cycle found for this PR' });
      return;
    }

    let created = 0;

    // Create new comments (default author = 'agent')
    for (const c of comments) {
      const id = randomUUID();
      db.insert(schema.comments)
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
      created++;
    }

    // Create replies (inherit filePath/startLine/endLine from parent)
    if (replies) {
      for (const r of replies) {
        const parent = db
          .select()
          .from(schema.comments)
          .where(eq(schema.comments.id, r.parentCommentId))
          .get();

        if (parent) {
          const id = randomUUID();
          db.insert(schema.comments)
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
          created++;
        }
      }
    }

    reply.code(201).send({ created });
  });
}
