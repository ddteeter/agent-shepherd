import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { schema } from '../db/index.js';

export async function insightsRoutes(fastify: FastifyInstance) {
  const db = (fastify as any).db;

  // GET /api/prs/:prId/insights — returns insights row with parsed categories, or null
  fastify.get('/api/prs/:prId/insights', async (request) => {
    const { prId } = request.params as { prId: string };

    const row = db
      .select()
      .from(schema.insights)
      .where(eq(schema.insights.prId, prId))
      .get();

    if (!row) {
      return null;
    }

    return {
      ...row,
      categories: JSON.parse(row.categories),
    };
  });

  // PUT /api/prs/:prId/insights — upsert: create if not exists, update if exists
  fastify.put('/api/prs/:prId/insights', async (request) => {
    const { prId } = request.params as { prId: string };
    const { categories, branchRef, worktreePath } = request.body as {
      categories: Record<string, unknown>;
      branchRef?: string;
      worktreePath?: string;
    };

    const categoriesJson = JSON.stringify(categories);

    const existing = db
      .select()
      .from(schema.insights)
      .where(eq(schema.insights.prId, prId))
      .get();

    if (existing) {
      db.update(schema.insights)
        .set({
          categories: categoriesJson,
          branchRef: branchRef ?? existing.branchRef,
          worktreePath: worktreePath ?? existing.worktreePath,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.insights.prId, prId))
        .run();
    } else {
      const id = randomUUID();
      db.insert(schema.insights)
        .values({
          id,
          prId,
          categories: categoriesJson,
          branchRef: branchRef ?? null,
          worktreePath: worktreePath ?? null,
        })
        .run();
    }

    const row = db
      .select()
      .from(schema.insights)
      .where(eq(schema.insights.prId, prId))
      .get();

    return {
      ...row,
      categories: JSON.parse(row.categories),
    };
  });
}
