import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { createDb } from './db/index.js';
import { schema } from './db/index.js';
import { projectRoutes } from './routes/projects.js';
import { pullRequestRoutes } from './routes/pull-requests.js';
import { commentRoutes } from './routes/comments.js';
import { diffRoutes } from './routes/diff.js';
import { websocketPlugin, broadcast } from './ws.js';
import { Orchestrator } from './orchestrator/index.js';

export interface ServerOptions {
  dbPath?: string;
  port?: number;
  host?: string;
}

export async function buildServer(opts: ServerOptions = {}) {
  const { dbPath = './shepherd.db', port = 3847, host = '127.0.0.1' } = opts;

  const fastify = Fastify({ logger: false });

  await fastify.register(cors, { origin: true });
  await fastify.register(websocket);
  await fastify.register(websocketPlugin);

  fastify.decorate('broadcast', broadcast);

  const { db, sqlite } = createDb(dbPath);

  fastify.decorate('db', db);
  fastify.decorate('sqlite', sqlite);

  const orchestrator = new Orchestrator({ db, schema, broadcast });
  fastify.decorate('orchestrator', orchestrator);

  fastify.addHook('onClose', () => {
    sqlite.close();
  });

  fastify.get('/api/health', async () => {
    return { status: 'ok' };
  });

  await fastify.register(projectRoutes);
  await fastify.register(pullRequestRoutes);
  await fastify.register(commentRoutes);
  await fastify.register(diffRoutes);

  return fastify;
}
