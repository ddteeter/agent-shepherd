import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import { homedir } from 'node:os';
import { eq } from 'drizzle-orm';
import { schema } from '../db/index.js';
import { ConfigService } from '../services/config.js';

export function configRoutes(fastify: FastifyInstance) {
  const database = fastify.db;
  const globalConfigPath = path.join(
    homedir(),
    '.agent-shepherd',
    'config.yml',
  );
  const configService = new ConfigService(database, globalConfigPath);

  fastify.get('/api/config', () => {
    return configService.getMergedGlobalConfig();
  });

  fastify.put('/api/config', async (request, reply) => {
    const { key, value } = request.body as { key?: string; value?: string };

    if (!key || value === undefined) {
      await reply.code(400).send({ error: 'key and value are required' });
      return;
    }

    configService.setGlobalDbConfig(key, value);
    return configService.getMergedGlobalConfig();
  });

  fastify.get('/api/projects/:id/config', async (request, reply) => {
    const { id } = request.params as { id: string };

    const project = database
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, id))
      .get();

    if (!project) {
      await reply.code(404).send({ error: 'Project not found' });
      return;
    }

    return configService.getMergedProjectConfig(id, project.path);
  });

  fastify.put('/api/projects/:id/config', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { key, value } = request.body as { key?: string; value?: string };

    const project = database
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, id))
      .get();

    if (!project) {
      await reply.code(404).send({ error: 'Project not found' });
      return;
    }

    if (!key || value === undefined) {
      await reply.code(400).send({ error: 'key and value are required' });
      return;
    }

    configService.setProjectDbConfig(id, key, value);
    return configService.getMergedProjectConfig(id, project.path);
  });
}
