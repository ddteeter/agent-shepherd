import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database, { type Database as DatabaseType } from 'better-sqlite3';
import {
  drizzle,
  type BetterSQLite3Database,
} from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';
import { migrateLegacyInsightCategories } from './data-migrations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__dirname, '../../drizzle');

export type AppDatabase = BetterSQLite3Database<typeof schema>;

export function createDatabase(databasePath = './agent-shepherd.db'): {
  db: AppDatabase;
  sqlite: DatabaseType;
} {
  const sqlite = new Database(databasePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const database = drizzle(sqlite, { schema });
  migrate(database, { migrationsFolder });
  migrateLegacyInsightCategories(database);

  return { db: database, sqlite };
}

export * as schema from './schema.js';
