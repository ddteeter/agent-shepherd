import { Command } from 'commander';
import { ApiClient } from '../api-client.js';

interface InsightsResult {
  categories: Record<string, unknown>;
}

export function insightsCommand(program: Command, client: ApiClient) {
  const insights = program
    .command('insights')
    .description('Workflow insights tools');

  insights
    .command('get <pr-id>')
    .description('Get current insights for a PR')
    .action(async (prId: string) => {
      const result = await client.get<InsightsResult | undefined>(
        `/api/prs/${prId}/insights`,
      );
      if (!result) {
        console.log('No insights found for this PR.');
        return;
      }
      console.log(JSON.stringify(result.categories, undefined, 2));
    });

  insights
    .command('update <pr-id>')
    .description('Update insights for a PR')
    .option('--stdin', 'Read insights JSON from stdin')
    .action(async (prId: string, options: { stdin?: boolean }) => {
      if (!options.stdin) {
        console.error('Must specify --stdin');
        process.exitCode = 1;
        return;
      }

      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk as Buffer);
      }
      const payload = JSON.parse(
        Buffer.concat(chunks).toString('utf8'),
      ) as unknown;
      const result = await client.put<InsightsResult>(
        `/api/prs/${prId}/insights`,
        payload,
      );
      console.log(
        `Insights updated for PR ${prId} (${String(Object.keys(result.categories).length)} categories)`,
      );
    });

  insights
    .command('history <project-id>')
    .description('Get all comments across PRs for a project')
    .option('--pr <pr-id>', 'Current PR ID to separate from other PRs')
    .action(async (projectId: string, options: { pr?: string }) => {
      const query = options.pr ? `?currentPrId=${options.pr}` : '';
      const result = await client.get<Record<string, unknown>>(
        `/api/projects/${projectId}/comments/history${query}`,
      );
      console.log(JSON.stringify(result, undefined, 2));
    });
}
