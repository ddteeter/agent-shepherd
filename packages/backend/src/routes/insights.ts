import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { schema } from '../db/index.js';

interface InsightItem {
  applied?: boolean;
  confidence?: string;
  appliedPath?: string;
  [key: string]: unknown;
}

interface InsightCategories {
  claudeMdRecommendations?: InsightItem[];
  skillRecommendations?: InsightItem[];
  promptEngineering?: InsightItem[];
  agentBehaviorObservations?: InsightItem[];
  recurringPatterns?: InsightItem[];
  [key: string]: InsightItem[] | undefined;
}

export function migrateInsightCategories(
  categories: InsightCategories,
): Record<string, InsightItem[]> {
  const migrate = (items: InsightItem[]) =>
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
      categories: migrateInsightCategories(
        JSON.parse(row.categories) as InsightCategories,
      ),
    };
  });

  fastify.put('/api/prs/:prId/insights', (request) => {
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
      database
        .update(schema.insights)
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
      database
        .insert(schema.insights)
        .values({
          id,
          prId,
          categories: categoriesJson,
          branchRef,
          worktreePath,
          updatedAt: new Date().toISOString(),
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
      categories: migrateInsightCategories(
        JSON.parse(row.categories) as InsightCategories,
      ),
    };
  });
}
