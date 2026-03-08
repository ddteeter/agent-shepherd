import { Command } from 'commander';
import { resolve, basename } from 'node:path';
import { ApiClient } from '../api-client.js';

export function initCommand(program: Command, client: ApiClient) {
  program
    .command('init [path]')
    .description('Register a project with Agent Shepherd')
    .option('-n, --name <name>', 'Project name')
    .option('-b, --base-branch <branch>', 'Base branch', 'main')
    .action(
      async (
        path: string | undefined,
        options: { name?: string; baseBranch: string },
      ) => {
        const projectPath = resolve(path || '.');
        const name = options.name || basename(projectPath);

        const project = await client.post('/api/projects', {
          name,
          path: projectPath,
          baseBranch: options.baseBranch,
        });
        console.log(
          `Project registered: ${(project as any).name} (${(project as any).id})`,
        );
      },
    );
}
