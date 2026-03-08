import { Command } from 'commander';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { BACKEND_DIST, FRONTEND_DIST } from '../paths.js';

export function startCommand(program: Command) {
  program
    .command('start')
    .description('Start the Agent Shepherd server')
    .option('--port <port>', 'Port to listen on', '3847')
    .option('--host <host>', 'Host to bind to', '127.0.0.1')
    .action(async (options: { port: string; host: string }) => {
      const serverEntry = `${BACKEND_DIST}/server.js`;
      if (!existsSync(serverEntry)) {
        console.error(`Backend not built. Run "npm run build" first.`);
        process.exit(1);
      }

      if (!existsSync(FRONTEND_DIST)) {
        console.warn('Warning: Frontend not built — running in API-only mode.');
      }

      const port = Number.parseInt(options.port, 10);
      const { buildServer } = (await import(
        pathToFileURL(serverEntry).href
      )) as {
        buildServer: (options_: { port?: number; host?: string }) => Promise<any>;
      };
      const server = await buildServer({ port, host: options.host });

      const shutdown = async () => {
        console.log('\nShutting down...');
        await server.close();
        process.exit(0);
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);

      await server.listen({ port, host: options.host });
      console.log(`Agent Shepherd running at http://${options.host}:${port}`);
    });
}
