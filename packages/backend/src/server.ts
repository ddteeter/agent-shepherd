import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import { eq } from 'drizzle-orm';
import { createDatabase, type AppDatabase } from './db/index.js';
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
import type { Database as DatabaseType } from 'better-sqlite3';
import {
  generateSessionToken,
  writeSessionToken,
  deleteSessionToken,
} from './services/session-token.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: AppDatabase;
    sqlite: DatabaseType;
    sessionToken: string;
    broadcast: typeof broadcast;
    orchestrator?: Orchestrator;
    notificationService: NotificationService;
  }
}

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
  const defaultDatabaseDirectory = path.join(homedir(), '.agent-shepherd');
  const defaultDatabasePath = path.join(
    defaultDatabaseDirectory,
    'agent-shepherd.db',
  );
  const {
    dbPath: databasePath = defaultDatabasePath,
    port = 3847,
    host = '127.0.0.1',
    frontendPort = 3848,
  } = options;

  const dataDirectory =
    databasePath === ':memory:' ? undefined : path.dirname(databasePath);

  if (dataDirectory) {
    mkdirSync(dataDirectory, { recursive: true });
  }

  // Session token setup
  const sessionToken = options.sessionToken ?? generateSessionToken();
  if (dataDirectory && !options.sessionToken) {
    writeSessionToken(dataDirectory, sessionToken);
  }

  const fastify = Fastify({ logger: false });

  fastify.decorate('sessionToken', sessionToken);

  // CORS: only allow localhost origins
  const allowedOrigins = new Set([
    `http://${host}:${String(port)}`,
    `http://localhost:${String(port)}`,
    `http://127.0.0.1:${String(port)}`,
    `http://localhost:${String(frontendPort)}`,
    `http://127.0.0.1:${String(frontendPort)}`,
  ]);

  await fastify.register(cors, {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) {
        callback(undefined as unknown as Error, true);
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

    const token = url.startsWith('/ws')
      ? (request.query as Record<string, string>).token
      : (request.headers['x-session-token'] as string | undefined);

    if (!token || token !== sessionToken) {
      await reply
        .status(401)
        .send({ error: 'Invalid or missing session token' });
    }
  });

  fastify.addHook('onClose', () => {
    sqlite.close();
    if (dataDirectory && !options.sessionToken) {
      deleteSessionToken(dataDirectory);
    }
  });

  fastify.get('/api/health', () => {
    return { status: 'ok' };
  });

  await fastify.register(projectRoutes);
  await fastify.register(pullRequestRoutes);
  await fastify.register(commentRoutes);
  await fastify.register(diffRoutes);
  await fastify.register(configRoutes);
  await fastify.register(insightsRoutes);

  // Serve bundled frontend static files (production mode)
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const frontendDistribution = path.resolve(__dirname, '../../frontend/dist');
  if (existsSync(frontendDistribution)) {
    // Read index.html and inject session token
    const rawHtml = readFileSync(
      path.join(frontendDistribution, 'index.html'),
      'utf8',
    );
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
      await reply.type('text/html').send(injectedHtml);
    });

    // SPA fallback: serve index.html for non-API, non-WS routes
    fastify.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/') || request.url.startsWith('/ws')) {
        void reply.status(404).send({ error: 'Not found' });
      } else {
        void reply.type('text/html').send(injectedHtml);
      }
    });
  }

  return fastify;
}
