import path from 'node:path';
import { homedir } from 'node:os';
import { buildServer } from './server.js';

const port = Number.parseInt(process.env.SHEPHERD_PORT ?? '3847', 10);
const host = process.env.SHEPHERD_HOST ?? '127.0.0.1';
const developmentMode = process.env.NODE_ENV === 'development';

async function main() {
  const server = await buildServer({ port, host, devMode: developmentMode });
  await server.listen({ port, host });
  console.log(
    `Agent Shepherd running at http://${host}:${String(port)}${developmentMode ? ' (dev mode)' : ''}`,
  );
  console.log(
    `Session token written to ${path.join(homedir(), '.agent-shepherd', 'session-token')}`,
  );

  const shutdown = async () => {
    await server.close();
  };
  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
}

await main().catch((error: unknown) => {
  console.error(error);
  throw error;
});
