import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export function createDb(dbPath: string = './shepherd.db') {
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });

  // Create tables if they don't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      base_branch TEXT NOT NULL DEFAULT 'main',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS pull_requests (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      source_branch TEXT NOT NULL,
      base_branch TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      agent_context TEXT,
      agent_session_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS review_cycles (
      id TEXT PRIMARY KEY,
      pr_id TEXT NOT NULL REFERENCES pull_requests(id),
      cycle_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_review',
      reviewed_at TEXT,
      agent_completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      review_cycle_id TEXT NOT NULL REFERENCES review_cycles(id),
      file_path TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      body TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'suggestion',
      author TEXT NOT NULL,
      parent_comment_id TEXT REFERENCES comments(id),
      resolved INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS diff_snapshots (
      id TEXT PRIMARY KEY,
      review_cycle_id TEXT NOT NULL REFERENCES review_cycles(id),
      diff_data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS global_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS project_config (
      project_id TEXT NOT NULL REFERENCES projects(id),
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (project_id, key)
    );
  `);

  return { db, sqlite };
}

export { schema };
