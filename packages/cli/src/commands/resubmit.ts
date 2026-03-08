import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { ApiClient } from '../api-client.js';

export function resubmitCommand(program: Command, client: ApiClient) {
  program
    .command('resubmit <pr-id>')
    .description('Resubmit a PR after making changes outside the review flow')
    .requiredOption(
      '-c, --context-file <path>',
      'Path to context file describing what changed',
    )
    .action(async (prId: string, options: { contextFile: string }) => {
      const context = await readFile(options.contextFile, 'utf-8');

      const result = await client.post(`/api/prs/${prId}/resubmit`, {
        context,
      });
      console.log(
        `PR resubmitted for review (cycle ${(result as any).cycleNumber})`,
      );
    });
}
