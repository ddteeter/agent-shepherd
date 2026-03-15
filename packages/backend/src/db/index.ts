import fs from 'node:fs';
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

function backupDatabase(databasePath: string): string | undefined {
  if (!fs.existsSync(databasePath)) return undefined;
  const backupPath = `${databasePath}.pre-migration`;
  fs.copyFileSync(databasePath, backupPath);
  const walPath = `${databasePath}-wal`;
  if (fs.existsSync(walPath)) {
    fs.copyFileSync(walPath, `${backupPath}-wal`);
  }
  return backupPath;
}

function restoreDatabase(databasePath: string, backupPath: string): void {
  fs.copyFileSync(backupPath, databasePath);
  const walBackup = `${backupPath}-wal`;
  const walPath = `${databasePath}-wal`;
  if (fs.existsSync(walBackup)) {
    fs.copyFileSync(walBackup, walPath);
  } else if (fs.existsSync(walPath)) {
    fs.unlinkSync(walPath);
  }
}

function cleanupBackup(backupPath: string): void {
  fs.unlinkSync(backupPath);
  const walBackup = `${backupPath}-wal`;
  if (fs.existsSync(walBackup)) fs.unlinkSync(walBackup);
}

export function createDatabase(databasePath = './agent-shepherd.db'): {
  db: AppDatabase;
  sqlite: DatabaseType;
} {
  const backupPath = backupDatabase(databasePath);

  const sqlite = new Database(databasePath);
  sqlite.pragma('journal_mode = WAL');

  // Foreign keys must be OFF during migrations because SQLite's table-rebuild
  // pattern (used by Drizzle for column changes) requires DROP TABLE, which
  // fails if foreign keys are enforced. PRAGMA foreign_keys cannot be changed
  // inside a transaction, so Drizzle's inline PRAGMA statements are ignored.
  sqlite.pragma('foreign_keys = OFF');
  const database = drizzle(sqlite, { schema });

  try {
    migrate(database, { migrationsFolder });
  } catch (error) {
    sqlite.close();
    if (backupPath) {
      restoreDatabase(databasePath, backupPath);
      cleanupBackup(backupPath);
    }
    throw error;
  }

  sqlite.pragma('foreign_keys = ON');

  const fkViolations = sqlite.pragma('foreign_key_check') as unknown[];
  if (fkViolations.length > 0) {
    sqlite.close();
    if (backupPath) {
      restoreDatabase(databasePath, backupPath);
      cleanupBackup(backupPath);
    }
    throw new Error(
      `Foreign key violations detected after migrations: ${JSON.stringify(fkViolations)}`,
    );
  }

  if (backupPath) cleanupBackup(backupPath);
  migrateLegacyInsightCategories(database);

  return { db: database, sqlite };
}

export * as schema from './schema.js';
