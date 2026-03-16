import type { FastifyInstance } from 'fastify';
import type { CreateProjectInput } from '@agent-shepherd/shared';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { schema } from '../db/index.js';
import { findProjectOrFail } from './route-helpers.js';

const pendingReviewCountSql = sql<number>`(
  SELECT count(*)
  FROM review_cycles
  JOIN pull_requests ON pull_requests.id = review_cycles.pr_id
  WHERE pull_requests.project_id = projects.id
    AND pull_requests.status = 'open'
    AND review_cycles.status = 'pending_review'
)`.as('pending_review_count');

export function projectRoutes(fastify: FastifyInstance) {
  const database = fastify.db;

  fastify.post('/api/projects', async (request, reply) => {
    const {
      name,
      path: projectPath,
      baseBranch,
    } = request.body as CreateProjectInput;

    const id = randomUUID();
    database
      .insert(schema.projects)
      .values({
        id,
        name,
        path: projectPath,
        baseBranch: baseBranch ?? 'main',
      })
      .run();

    const project = database
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, id))
      .get();

    fastify.broadcast('project:created', project);

    await reply.code(201).send(project);
  });

  fastify.get('/api/projects', () => {
    return database
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        path: schema.projects.path,
        baseBranch: schema.projects.baseBranch,
        createdAt: schema.projects.createdAt,
        pendingReviewCount: pendingReviewCountSql,
      })
      .from(schema.projects)
      .all();
  });

  fastify.get('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await findProjectOrFail(database, id, reply);
    if (!project) return;
    return project;
  });

  fastify.put('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const updates = request.body as Partial<{
      name: string;
      path: string;
      baseBranch: string;
    }>;

    const existing = await findProjectOrFail(database, id, reply);
    if (!existing) return;

    database
      .update(schema.projects)
      .set(updates)
      .where(eq(schema.projects.id, id))
      .run();

    return database
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, id))
      .get();
  });

  fastify.delete('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await findProjectOrFail(database, id, reply);
    if (!existing) return;

    database.delete(schema.projects).where(eq(schema.projects.id, id)).run();
    await reply.code(204).send();
  });
}
