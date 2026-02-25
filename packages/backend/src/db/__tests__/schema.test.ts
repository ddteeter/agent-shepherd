import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../schema.js';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

describe('Database Schema', () => {
  let sqlite: InstanceType<typeof Database>;
  let db: ReturnType<typeof drizzle>;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    db = drizzle(sqlite, { schema });
    // Create tables directly for testing
    sqlite.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        base_branch TEXT NOT NULL DEFAULT 'main',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE pull_requests (
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
      CREATE TABLE review_cycles (
        id TEXT PRIMARY KEY,
        pr_id TEXT NOT NULL REFERENCES pull_requests(id),
        cycle_number INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending_review',
        reviewed_at TEXT,
        agent_completed_at TEXT
      );
      CREATE TABLE comments (
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
      CREATE TABLE diff_snapshots (
        id TEXT PRIMARY KEY,
        review_cycle_id TEXT NOT NULL REFERENCES review_cycles(id),
        diff_data TEXT NOT NULL
      );
      CREATE TABLE global_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE project_config (
        project_id TEXT NOT NULL REFERENCES projects(id),
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (project_id, key)
      );
    `);
  });

  afterEach(() => {
    sqlite.close();
  });

  it('can insert and query a project', () => {
    const id = randomUUID();
    db.insert(schema.projects).values({
      id,
      name: 'test-project',
      path: '/tmp/test-repo',
      baseBranch: 'main',
    }).run();

    const result = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
    expect(result).toBeDefined();
    expect(result!.name).toBe('test-project');
    expect(result!.path).toBe('/tmp/test-repo');
  });

  it('can insert and query a pull request', () => {
    const projectId = randomUUID();
    const prId = randomUUID();

    db.insert(schema.projects).values({
      id: projectId,
      name: 'test',
      path: '/tmp/repo',
      baseBranch: 'main',
    }).run();

    db.insert(schema.pullRequests).values({
      id: prId,
      projectId,
      title: 'Add feature',
      description: 'A new feature',
      sourceBranch: 'feat/new',
      baseBranch: 'main',
      status: 'open',
    }).run();

    const result = db.select().from(schema.pullRequests).where(eq(schema.pullRequests.id, prId)).get();
    expect(result).toBeDefined();
    expect(result!.title).toBe('Add feature');
    expect(result!.status).toBe('open');
  });

  it('can insert a comment with thread parent', () => {
    const projectId = randomUUID();
    const prId = randomUUID();
    const cycleId = randomUUID();
    const commentId = randomUUID();
    const replyId = randomUUID();

    db.insert(schema.projects).values({ id: projectId, name: 'test', path: '/tmp/r', baseBranch: 'main' }).run();
    db.insert(schema.pullRequests).values({ id: prId, projectId, title: 'PR', description: '', sourceBranch: 'feat', baseBranch: 'main', status: 'open' }).run();
    db.insert(schema.reviewCycles).values({ id: cycleId, prId, cycleNumber: 1, status: 'in_review' }).run();

    db.insert(schema.comments).values({
      id: commentId,
      reviewCycleId: cycleId,
      filePath: 'src/index.ts',
      startLine: 10,
      endLine: 10,
      body: 'This needs fixing',
      severity: 'must-fix',
      author: 'human',
      resolved: false,
    }).run();

    db.insert(schema.comments).values({
      id: replyId,
      reviewCycleId: cycleId,
      filePath: 'src/index.ts',
      startLine: 10,
      endLine: 10,
      body: 'Fixed it',
      severity: 'suggestion',
      author: 'agent',
      parentCommentId: commentId,
      resolved: false,
    }).run();

    const reply = db.select().from(schema.comments).where(eq(schema.comments.id, replyId)).get();
    expect(reply).toBeDefined();
    expect(reply!.parentCommentId).toBe(commentId);
  });
});
