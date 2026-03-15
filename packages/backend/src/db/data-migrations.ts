import { eq } from 'drizzle-orm';
import type { AppDatabase } from './index.js';
import { schema } from './index.js';

interface LegacyInsightItem {
  applied?: boolean;
  confidence?: string;
  appliedPath?: string;
  firstSeenAt?: string;
  [key: string]: unknown;
}

type LegacyInsightCategories = Record<string, LegacyInsightItem[] | undefined>;

const CATEGORY_KEYS = [
  'toolRecommendations',
  'claudeMdRecommendations',
  'skillRecommendations',
  'promptEngineering',
  'agentBehaviorObservations',
  'recurringPatterns',
] as const;

function needsMigration(categories: LegacyInsightCategories): boolean {
  for (const key of CATEGORY_KEYS) {
    const items = categories[key];
    if (!items) return true;
    for (const item of items) {
      if ('applied' in item) return true;
      if (!item.confidence) return true;
    }
  }
  return false;
}

export function migrateCategories(
  categories: LegacyInsightCategories,
): Record<string, LegacyInsightItem[]> {
  const migrate = (items: LegacyInsightItem[]) =>
    items.map(({ applied, ...rest }) => ({
      ...rest,
      confidence: rest.confidence ?? 'medium',
      ...(applied === true ? { appliedPath: 'CLAUDE.md' } : {}),
    }));

  const result: Record<string, LegacyInsightItem[]> = {};
  for (const key of CATEGORY_KEYS) {
    result[key] = migrate(categories[key] ?? []);
  }
  return result;
}

export function migrateLegacyInsightCategories(database: AppDatabase): void {
  const rows = database.select().from(schema.insights).all();

  for (const row of rows) {
    const categories = JSON.parse(row.categories) as LegacyInsightCategories;

    if (!needsMigration(categories)) continue;

    const migrated = migrateCategories(categories);

    database
      .update(schema.insights)
      .set({ categories: JSON.stringify(migrated) })
      .where(eq(schema.insights.id, row.id))
      .run();
  }
}
