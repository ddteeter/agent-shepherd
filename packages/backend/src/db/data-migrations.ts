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

const MIGRATION_KEY = 'data_migration:legacy_insight_categories';

export function migrateLegacyInsightCategories(database: AppDatabase): void {
  const existing = database
    .select()
    .from(schema.globalConfig)
    .where(eq(schema.globalConfig.key, MIGRATION_KEY))
    .get();

  if (existing) return;

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

  database
    .insert(schema.globalConfig)
    .values({ key: MIGRATION_KEY, value: 'completed' })
    .run();
}
