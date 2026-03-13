import { Command } from 'commander';
import path from 'node:path';
import { ApiClient } from '../api-client.js';

interface ProjectResult {
  name: string;
  id: string;
}

export function initCommand(program: Command, client: ApiClient) {
  program
    .command('init [path]')
    .description('Register a project with Agent Shepherd')
    .option('-n, --name <name>', 'Project name')
    .option('-b, --base-branch <branch>', 'Base branch', 'main')
    .action(
      async (
        initPath: string | undefined,
        options: { name?: string; baseBranch: string },
      ) => {
        const projectPath = path.resolve(initPath ?? '.');
        const name = options.name ?? path.basename(projectPath);

        const project = await client.post<ProjectResult>('/api/projects', {
          name,
          path: projectPath,
          baseBranch: options.baseBranch,
        });
        console.log(`Project registered: ${project.name} (${project.id})`);
      },
    );
}
