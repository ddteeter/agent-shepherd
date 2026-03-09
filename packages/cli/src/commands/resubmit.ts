import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { ApiClient } from '../api-client.js';

interface ResubmitResult {
  cycleNumber: number;
}

export function resubmitCommand(program: Command, client: ApiClient) {
  program
    .command('resubmit <pr-id>')
    .description('Resubmit a PR after making changes outside the review flow')
    .requiredOption(
      '-c, --context-file <path>',
      'Path to context file describing what changed',
    )
    .action(async (prId: string, options: { contextFile: string }) => {
      const context = await readFile(options.contextFile, 'utf8');

      const result = await client.post<ResubmitResult>(
        `/api/prs/${prId}/resubmit`,
        {
          context,
        },
      );
      console.log(
        `PR resubmitted for review (cycle ${String(result.cycleNumber)})`,
      );
    });
}
