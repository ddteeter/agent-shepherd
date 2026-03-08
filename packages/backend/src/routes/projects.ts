import type { FastifyInstance } from 'fastify';
import type { CreateProjectInput } from '@agent-shepherd/shared';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { schema } from '../db/index.js';

export async function projectRoutes(fastify: FastifyInstance) {
  const database = (fastify as any).db;

  fastify.post('/api/projects', async (request, reply) => {
    const { name, path, baseBranch } = request.body as CreateProjectInput;

    const id = randomUUID();
    database.insert(schema.projects)
      .values({ id, name, path, baseBranch: baseBranch || 'main' })
      .run();

    const project = database
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, id))
      .get();

    reply.code(201).send(project);
  });

  fastify.get('/api/projects', async () => {
    return database.select().from(schema.projects).all();
  });

  fastify.get('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = database
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, id))
      .get();

    if (!project) {
      reply.code(404).send({ error: 'Project not found' });
      return;
    }
    return project;
  });

  fastify.put('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const updates = request.body as Partial<{
      name: string;
      path: string;
      baseBranch: string;
    }>;

    const existing = database
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, id))
      .get();

    if (!existing) {
      reply.code(404).send({ error: 'Project not found' });
      return;
    }

    database.update(schema.projects)
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

    const existing = database
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, id))
      .get();

    if (!existing) {
      reply.code(404).send({ error: 'Project not found' });
      return;
    }

    database.delete(schema.projects).where(eq(schema.projects.id, id)).run();
    reply.code(204).send();
  });
}
