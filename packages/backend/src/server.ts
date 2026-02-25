import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createDb } from './db/index.js';
import { projectRoutes } from './routes/projects.js';
import { pullRequestRoutes } from './routes/pull-requests.js';

export interface ServerOptions {
  dbPath?: string;
  port?: number;
  host?: string;
}

export async function buildServer(opts: ServerOptions = {}) {
  const { dbPath = './shepherd.db', port = 3847, host = '127.0.0.1' } = opts;

  const fastify = Fastify({ logger: false });

  await fastify.register(cors, { origin: true });

  const { db, sqlite } = createDb(dbPath);

  fastify.decorate('db', db);
  fastify.decorate('sqlite', sqlite);

  fastify.addHook('onClose', () => {
    sqlite.close();
  });

  fastify.get('/api/health', async () => {
    return { status: 'ok' };
  });

  await fastify.register(projectRoutes);
  await fastify.register(pullRequestRoutes);

  return fastify;
}
