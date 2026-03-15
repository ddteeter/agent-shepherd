import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { schema } from '../db/index.js';
import type { InsightCategories } from '@agent-shepherd/shared';
import { diffInsightCategories } from './insight-differ.js';

export function insightsRoutes(fastify: FastifyInstance) {
  const database = fastify.db;

  fastify.get('/api/prs/:prId/insights', (request, reply) => {
    const { prId } = request.params as { prId: string };

    const row = database
      .select()
      .from(schema.insights)
      .where(eq(schema.insights.prId, prId))
      .get();

    if (!row) {
      return reply.send(JSON.parse('null') as unknown);
    }

    return {
      ...row,
      categories: JSON.parse(row.categories) as InsightCategories,
    };
  });

  fastify.put('/api/prs/:prId/insights', (request) => {
    const { prId } = request.params as { prId: string };
    const { categories, branchRef, worktreePath } = request.body as {
      categories: InsightCategories;
      branchRef?: string;
      worktreePath?: string;
    };

    const existing = database
      .select()
      .from(schema.insights)
      .where(eq(schema.insights.prId, prId))
      .get();

    const existingCategories = existing
      ? (JSON.parse(existing.categories) as InsightCategories)
      : undefined;

    const diffedCategories = diffInsightCategories(
      categories,
      existingCategories,
    );
    const categoriesJson = JSON.stringify(diffedCategories);
    const now = new Date().toISOString();

    if (existing) {
      database
        .update(schema.insights)
        .set({
          categories: categoriesJson,
          ...(branchRef === undefined ? {} : { branchRef }),
          ...(worktreePath === undefined ? {} : { worktreePath }),
          previousUpdatedAt: existing.updatedAt,
          updatedAt: now,
        })
        .where(eq(schema.insights.id, existing.id))
        .run();
    } else {
      const id = randomUUID();
      database
        .insert(schema.insights)
        .values({
          id,
          prId,
          categories: categoriesJson,
          branchRef,
          worktreePath,
          previousUpdatedAt: undefined,
          updatedAt: now,
        })
        .run();
    }

    const row = database
      .select()
      .from(schema.insights)
      .where(eq(schema.insights.prId, prId))
      .get();

    if (!row) {
      return;
    }

    return {
      ...row,
      categories: JSON.parse(row.categories) as InsightCategories,
    };
  });
}
