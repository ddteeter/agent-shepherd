import { Command } from 'commander';
import { ApiClient } from '../api-client.js';

interface Project {
  id: string;
  name: string;
  path: string;
}

export function listProjectsCommand(program: Command, client: ApiClient) {
  program
    .command('list-projects')
    .description('List registered projects')
    .action(async () => {
      const projects = await client.get<Project[]>('/api/projects');
      if (projects.length === 0) {
        console.log(
          'No projects registered. Use "agent-shepherd init <path>" to register one.',
        );
        return;
      }
      console.log(
        'ID                                    Name              Path',
      );
      console.log(
        '------------------------------------  ----------------  ----',
      );
      for (const p of projects) {
        console.log(`${p.id}  ${p.name.padEnd(16)}  ${p.path}`);
      }
    });
}
