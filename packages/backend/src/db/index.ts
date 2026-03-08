import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(__dirname, '../../drizzle');

export function createDb(databasePath = './agent-shepherd.db'): {
  db: ReturnType<typeof drizzle>;
  sqlite: DatabaseType;
} {
  const sqlite = new Database(databasePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const database = drizzle(sqlite, { schema });
  migrate(database, { migrationsFolder });

  return { db: database, sqlite };
}



export * as schema from './schema.js';