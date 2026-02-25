import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb, schema } from '../index.js';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

describe('Database Schema', () => {
  let sqlite: InstanceType<typeof Database>;
  let db: BetterSQLite3Database<typeof schema>;

  beforeEach(() => {
    const result = createDb(':memory:');
    sqlite = result.sqlite;
    db = result.db;
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
