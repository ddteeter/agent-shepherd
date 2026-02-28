import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  path: text('path').notNull().unique(),
  baseBranch: text('base_branch').notNull().default('main'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const pullRequests = sqliteTable('pull_requests', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  sourceBranch: text('source_branch').notNull(),
  baseBranch: text('base_branch').notNull(),
  status: text('status').notNull().default('open'),
  agentContext: text('agent_context'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

export const reviewCycles = sqliteTable('review_cycles', {
  id: text('id').primaryKey(),
  prId: text('pr_id').notNull().references(() => pullRequests.id),
  cycleNumber: integer('cycle_number').notNull(),
  status: text('status').notNull().default('pending_review'),
  reviewedAt: text('reviewed_at'),
  agentCompletedAt: text('agent_completed_at'),
  commitSha: text('commit_sha'),
});

export const comments = sqliteTable('comments', {
  id: text('id').primaryKey(),
  reviewCycleId: text('review_cycle_id').notNull().references(() => reviewCycles.id),
  filePath: text('file_path'),
  startLine: integer('start_line'),
  endLine: integer('end_line'),
  body: text('body').notNull(),
  severity: text('severity').notNull().default('suggestion'),
  author: text('author').notNull(),
  parentCommentId: text('parent_comment_id').references((): any => comments.id),
  resolved: integer('resolved', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const diffSnapshots = sqliteTable('diff_snapshots', {
  id: text('id').primaryKey(),
  reviewCycleId: text('review_cycle_id').notNull().references(() => reviewCycles.id),
  diffData: text('diff_data').notNull(),
});

export const globalConfig = sqliteTable('global_config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const projectConfig = sqliteTable('project_config', {
  projectId: text('project_id').notNull().references(() => projects.id),
  key: text('key').notNull(),
  value: text('value').notNull(),
}, (t) => [
  primaryKey({ columns: [t.projectId, t.key] }),
]);
