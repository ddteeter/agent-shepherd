import type { FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { schema } from '../db/index.js';
import type { AppDatabase } from '../db/index.js';

export async function findPrOrFail(
  database: AppDatabase,
  id: string,
  reply: FastifyReply,
) {
  const pr = database
    .select()
    .from(schema.pullRequests)
    .where(eq(schema.pullRequests.id, id))
    .get();
  if (!pr) {
    await reply.code(404).send({ error: 'Pull request not found' });
  }
  return pr;
}

export async function findProjectOrFail(
  database: AppDatabase,
  id: string,
  reply: FastifyReply,
) {
  const project = database
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, id))
    .get();
  if (!project) {
    await reply.code(404).send({ error: 'Project not found' });
  }
  return project;
}
