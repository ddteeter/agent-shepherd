import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import { eq } from 'drizzle-orm';
import { createDb as createDatabase } from './db/index.js';
import { schema } from './db/index.js';
import { projectRoutes } from './routes/projects.js';
import { pullRequestRoutes } from './routes/pull-requests.js';
import { commentRoutes } from './routes/comments.js';
import { diffRoutes } from './routes/diff.js';
import { configRoutes } from './routes/config.js';
import { insightsRoutes } from './routes/insights.js';
import { websocketPlugin, broadcast } from './ws.js';
import { Orchestrator } from './orchestrator/index.js';
import { NotificationService } from './services/notifications.js';
import {
  generateSessionToken,
  writeSessionToken,
  deleteSessionToken,
} from './services/session-token.js';

export interface ServerOptions {
  dbPath?: string;
  port?: number;
  host?: string;
  /** Skip orchestrator registration (useful for tests that don't need agent spawning) */
  disableOrchestrator?: boolean;
  /** Enable verbose agent output streaming */
  devMode?: boolean;
  /** Pre-set session token (skips file write; useful for tests) */
  sessionToken?: string;
  /** Frontend dev server port (for CORS allowlist) */
  frontendPort?: number;
}

export async function buildServer(options: ServerOptions = {}) {
  const defaultDbDir = join(homedir(), '.agent-shepherd');
  const defaultDatabasePath = join(defaultDbDir, 'agent-shepherd.db');
  const {
    dbPath: databasePath = defaultDatabasePath,
    port = 3847,
    host = '127.0.0.1',
    frontendPort = 3848,
  } = options;

  const dataDir = databasePath === ':memory:' ? null : dirname(databasePath);

  if (dataDir) {
    mkdirSync(dataDir, { recursive: true });
  }

  // Session token setup
  const sessionToken = options.sessionToken ?? generateSessionToken();
  if (dataDir && !options.sessionToken) {
    writeSessionToken(dataDir, sessionToken);
  }

  const fastify = Fastify({ logger: false });

  fastify.decorate('sessionToken', sessionToken);

  // CORS: only allow localhost origins
  const allowedOrigins = new Set([
    `http://${host}:${port}`,
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
    `http://localhost:${frontendPort}`,
    `http://127.0.0.1:${frontendPort}`,
  ]);

  await fastify.register(cors, {
    origin: (origin, callback) => {
      // Allow requests with no Origin header (CLI, same-origin, curl)
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'), false);
      }
    },
  });

  await fastify.register(websocket);
  await fastify.register(websocketPlugin);

  fastify.decorate('broadcast', broadcast);

  const { db, sqlite } = createDatabase(databasePath);

  fastify.decorate('db', db);
  fastify.decorate('sqlite', sqlite);

  // Reset stale agent_working cycles from previous server runs
  db.update(schema.reviewCycles)
    .set({ status: 'agent_error' })
    .where(eq(schema.reviewCycles.status, 'agent_working'))
    .run();

  const notificationService = new NotificationService();
  fastify.decorate('notificationService', notificationService);

  if (!options.disableOrchestrator) {
    const orchestrator = new Orchestrator({
      db,
      schema,
      broadcast,
      notificationService,
      devMode: options.devMode,
    });
    fastify.decorate('orchestrator', orchestrator);
  }

  // Session token validation hook
  fastify.addHook('onRequest', async (request, reply) => {
    const url = request.url;

    // Skip auth for health check and non-API/non-WS routes (static files)
    if (
      url === '/api/health' ||
      (!url.startsWith('/api/') && !url.startsWith('/ws'))
    ) {
      return;
    }

    // WebSocket: read token from query param
    let token: string | undefined;
    if (url.startsWith('/ws')) {
      token = (request.query as Record<string, string>).token;
    } else {
      // REST: read token from header
      token = request.headers['x-session-token'] as string | undefined;
    }

    if (!token || token !== sessionToken) {
      reply.status(401).send({ error: 'Invalid or missing session token' });
    }
  });

  fastify.addHook('onClose', () => {
    sqlite.close();
    if (dataDir && !options.sessionToken) {
      deleteSessionToken(dataDir);
    }
  });

  fastify.get('/api/health', async () => {
    return { status: 'ok' };
  });

  await fastify.register(projectRoutes);
  await fastify.register(pullRequestRoutes);
  await fastify.register(commentRoutes);
  await fastify.register(diffRoutes);
  await fastify.register(configRoutes);
  await fastify.register(insightsRoutes);

  // Serve bundled frontend static files (production mode)
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const frontendDistribution = resolve(__dirname, '../../frontend/dist');
  if (existsSync(frontendDistribution)) {
    // Read index.html and inject session token
    const rawHtml = readFileSync(join(frontendDistribution, 'index.html'), 'utf-8');
    const injectedHtml = rawHtml.replace(
      '</head>',
      `<script>window.__SHEPHERD_TOKEN__="${sessionToken}"</script></head>`,
    );

    await fastify.register(fastifyStatic, {
      root: frontendDistribution,
      prefix: '/',
    });

    // Override root route to serve injected HTML
    fastify.get('/', async (_request, reply) => {
      reply.type('text/html').send(injectedHtml);
    });

    // SPA fallback: serve index.html for non-API, non-WS routes
    fastify.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/') || request.url.startsWith('/ws')) {
        reply.status(404).send({ error: 'Not found' });
      } else {
        reply.type('text/html').send(injectedHtml);
      }
    });
  }

  return fastify;
}
