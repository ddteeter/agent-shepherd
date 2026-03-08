import type { FastifyInstance } from 'fastify';
import type { CreateProjectInput } from '@agent-shepherd/shared';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { schema } from '../db/index.js';

export async function projectRoutes(fastify: FastifyInstance) {
  const db = (fastify as any).db;

  fastify.post('/api/projects', async (request, reply) => {
    const { name, path, baseBranch } = request.body as CreateProjectInput;

    const id = randomUUID();
    db.insert(schema.projects)
      .values({ id, name, path, baseBranch: baseBranch || 'main' })
      .run();

    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, id))
      .get();

    reply.code(201).send(project);
  });

  fastify.get('/api/projects', async () => {
    return db.select().from(schema.projects).all();
  });

  fastify.get('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = db
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

    const existing = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, id))
      .get();

    if (!existing) {
      reply.code(404).send({ error: 'Project not found' });
      return;
    }

    db.update(schema.projects)
      .set(updates)
      .where(eq(schema.projects.id, id))
      .run();

    return db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, id))
      .get();
  });

  fastify.delete('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, id))
      .get();

    if (!existing) {
      reply.code(404).send({ error: 'Project not found' });
      return;
    }

    db.delete(schema.projects).where(eq(schema.projects.id, id)).run();
    reply.code(204).send();
  });
}
