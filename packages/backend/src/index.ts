import { join } from 'node:path';
import { homedir } from 'node:os';
import { buildServer } from './server.js';

const port = Number.parseInt(process.env.SHEPHERD_PORT || '3847', 10);
const host = process.env.SHEPHERD_HOST || '127.0.0.1';
const developmentMode = process.env.NODE_ENV === 'development';

async function main() {
  const server = await buildServer({ port, host, devMode: developmentMode });
  await server.listen({ port, host });
  console.log(
    `Agent Shepherd running at http://${host}:${port}${developmentMode ? ' (dev mode)' : ''}`,
  );
  console.log(
    `Session token written to ${join(homedir(), '.agent-shepherd', 'session-token')}`,
  );

  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
