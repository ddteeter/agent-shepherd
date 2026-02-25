import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createDb } from './db/index.js';

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

  return fastify;
}
