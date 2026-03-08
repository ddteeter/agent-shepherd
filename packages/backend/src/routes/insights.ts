import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { schema } from '../db/index.js';

export function migrateInsightCategories(
  categories: Record<string, any[]>,
): Record<string, any[]> {
  const migrate = (items: any[]) =>
    items.map(({ applied, ...rest }) => ({
      ...rest,
      confidence: rest.confidence ?? 'medium',
      ...(applied === true ? { appliedPath: 'CLAUDE.md' } : {}),
    }));

  return {
    claudeMdRecommendations: migrate(categories.claudeMdRecommendations ?? []),
    skillRecommendations: migrate(categories.skillRecommendations ?? []),
    promptEngineering: migrate(categories.promptEngineering ?? []),
    agentBehaviorObservations: migrate(
      categories.agentBehaviorObservations ?? [],
    ),
    recurringPatterns: migrate(categories.recurringPatterns ?? []),
  };
}

export async function insightsRoutes(fastify: FastifyInstance) {
  const database = (fastify as any).db;

  // GET /api/prs/:prId/insights — returns insights row with parsed categories, or null
  fastify.get('/api/prs/:prId/insights', async (request) => {
    const { prId } = request.params as { prId: string };

    const row = database
      .select()
      .from(schema.insights)
      .where(eq(schema.insights.prId, prId))
      .get();

    if (!row) {
      return null;
    }

    return {
      ...row,
      categories: migrateInsightCategories(JSON.parse(row.categories)),
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

    const existing = database
      .select()
      .from(schema.insights)
      .where(eq(schema.insights.prId, prId))
      .get();

    if (existing) {
      database.update(schema.insights)
        .set({
          categories: categoriesJson,
          ...(branchRef === undefined ? {} : { branchRef }),
          ...(worktreePath === undefined ? {} : { worktreePath }),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.insights.id, existing.id))
        .run();
    } else {
      const id = randomUUID();
      database.insert(schema.insights)
        .values({
          id,
          prId,
          categories: categoriesJson,
          branchRef: branchRef ?? null,
          worktreePath: worktreePath ?? null,
          updatedAt: new Date().toISOString(),
        })
        .run();
    }

    const row = database
      .select()
      .from(schema.insights)
      .where(eq(schema.insights.prId, prId))
      .get();

    return {
      ...row,
      categories: migrateInsightCategories(JSON.parse(row.categories)),
    };
  });
}
