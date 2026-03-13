import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import { homedir } from 'node:os';
import { ConfigService } from '../services/config.js';
import { findProjectOrFail } from './route-helpers.js';

function hasKeyAndValue(body: {
  key?: string;
  value?: string;
}): body is { key: string; value: string } {
  return !!body.key && body.value !== undefined;
}

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
    const body = request.body as { key?: string; value?: string };

    if (!hasKeyAndValue(body)) {
      await reply.code(400).send({ error: 'key and value are required' });
      return;
    }

    configService.setGlobalDbConfig(body.key, body.value);
    return configService.getMergedGlobalConfig();
  });

  fastify.get('/api/projects/:id/config', async (request, reply) => {
    const { id } = request.params as { id: string };

    const project = await findProjectOrFail(database, id, reply);
    if (!project) return;

    return configService.getMergedProjectConfig(id, project.path);
  });

  fastify.put('/api/projects/:id/config', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { key?: string; value?: string };

    const project = await findProjectOrFail(database, id, reply);
    if (!project) return;

    if (!hasKeyAndValue(body)) {
      await reply.code(400).send({ error: 'key and value are required' });
      return;
    }

    configService.setProjectDbConfig(id, body.key, body.value);
    return configService.getMergedProjectConfig(id, project.path);
  });
}
