import { existsSync, mkdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import { createDb } from './db/index.js';
import { schema } from './db/index.js';
import { projectRoutes } from './routes/projects.js';
import { pullRequestRoutes } from './routes/pull-requests.js';
import { commentRoutes } from './routes/comments.js';
import { diffRoutes } from './routes/diff.js';
import { configRoutes } from './routes/config.js';
import { websocketPlugin, broadcast } from './ws.js';
import { Orchestrator } from './orchestrator/index.js';
import { NotificationService } from './services/notifications.js';

export interface ServerOptions {
  dbPath?: string;
  port?: number;
  host?: string;
  /** Skip orchestrator registration (useful for tests that don't need agent spawning) */
  disableOrchestrator?: boolean;
}

export async function buildServer(opts: ServerOptions = {}) {
  const defaultDbDir = join(homedir(), '.agent-shepherd');
  const defaultDbPath = join(defaultDbDir, 'agent-shepherd.db');
  const { dbPath = defaultDbPath, port = 3847, host = '127.0.0.1' } = opts;

  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const fastify = Fastify({ logger: false });

  await fastify.register(cors, { origin: true });
  await fastify.register(websocket);
  await fastify.register(websocketPlugin);

  fastify.decorate('broadcast', broadcast);

  const { db, sqlite } = createDb(dbPath);

  fastify.decorate('db', db);
  fastify.decorate('sqlite', sqlite);

  const notificationService = new NotificationService();
  fastify.decorate('notificationService', notificationService);

  if (!opts.disableOrchestrator) {
    const orchestrator = new Orchestrator({ db, schema, broadcast, notificationService });
    fastify.decorate('orchestrator', orchestrator);
  }

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
  await fastify.register(configRoutes);

  // Serve bundled frontend static files (production mode)
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const frontendDist = resolve(__dirname, '../../frontend/dist');
  if (existsSync(frontendDist)) {
    await fastify.register(fastifyStatic, {
      root: frontendDist,
      prefix: '/',
    });

    // SPA fallback: serve index.html for non-API, non-WS routes
    fastify.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/') || request.url.startsWith('/ws')) {
        reply.status(404).send({ error: 'Not found' });
      } else {
        reply.sendFile('index.html');
      }
    });
  }

  return fastify;
}
