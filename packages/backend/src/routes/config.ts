import type { FastifyInstance } from 'fastify';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { eq } from 'drizzle-orm';
import { schema } from '../db/index.js';
import { ConfigService } from '../services/config.js';

export async function configRoutes(fastify: FastifyInstance) {
  const database = (fastify as any).db;
  const globalConfigPath = join(homedir(), '.agent-shepherd', 'config.yml');
  const configService = new ConfigService(database, globalConfigPath);

  // GET /api/config - Get merged global config (file + DB)
  fastify.get('/api/config', async () => {
    return configService.getMergedGlobalConfig();
  });

  // PUT /api/config - Set a global config key/value in DB
  fastify.put('/api/config', async (request, reply) => {
    const { key, value } = request.body as { key: string; value: string };

    if (!key || value === undefined || value === null) {
      reply.code(400).send({ error: 'key and value are required' });
      return;
    }

    configService.setGlobalDbConfig(key, String(value));
    return configService.getMergedGlobalConfig();
  });

  // GET /api/projects/:id/config - Get merged project config (global + project file + DB)
  fastify.get('/api/projects/:id/config', async (request, reply) => {
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

    return configService.getMergedProjectConfig(id, project.path);
  });

  // PUT /api/projects/:id/config - Set a project config key/value in DB
  fastify.put('/api/projects/:id/config', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { key, value } = request.body as { key: string; value: string };

    const project = database
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, id))
      .get();

    if (!project) {
      reply.code(404).send({ error: 'Project not found' });
      return;
    }

    if (!key || value === undefined || value === null) {
      reply.code(400).send({ error: 'key and value are required' });
      return;
    }

    configService.setProjectDbConfig(id, key, String(value));
    return configService.getMergedProjectConfig(id, project.path);
  });
}
