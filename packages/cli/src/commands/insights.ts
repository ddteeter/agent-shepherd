import { Command } from 'commander';
import { ApiClient } from '../api-client.js';

export function insightsCommand(program: Command, client: ApiClient) {
  const insights = program
    .command('insights')
    .description('Workflow insights tools');

  insights
    .command('get <pr-id>')
    .description('Get current insights for a PR')
    .action(async (prId: string) => {
      const result = await client.get<any>(`/api/prs/${prId}/insights`);
      if (!result) {
        console.log('No insights found for this PR.');
        return;
      }
      console.log(JSON.stringify(result.categories, null, 2));
    });

  insights
    .command('update <pr-id>')
    .description('Update insights for a PR')
    .option('--stdin', 'Read insights JSON from stdin')
    .action(async (prId: string, options: { stdin?: boolean }) => {
      if (!options.stdin) {
        console.error('Must specify --stdin');
        process.exit(1);
      }

      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
      const result = await client.put<any>(
        `/api/prs/${prId}/insights`,
        payload,
      );
      console.log(
        `Insights updated for PR ${prId} (${Object.keys(result.categories).length} categories)`,
      );
    });

  insights
    .command('history <project-id>')
    .description('Get all comments across PRs for a project')
    .action(async (projectId: string) => {
      const comments = await client.get<any[]>(
        `/api/projects/${projectId}/comments/history`,
      );
      console.log(JSON.stringify(comments, null, 2));
    });
}
