import { Command } from 'commander';
import { readFile } from 'fs/promises';
import { ApiClient } from '../api-client.js';

export function readyCommand(program: Command, client: ApiClient) {
  program
    .command('ready <pr-id>')
    .description('Signal PR is ready for re-review')
    .option('-f, --file <path>', 'Batch comments JSON file to submit before signaling ready')
    .action(async (prId: string, opts: { file?: string }) => {
      if (opts.file) {
        const payload = await readFile(opts.file, 'utf-8');
        const result = await client.post(`/api/prs/${prId}/comments/batch`, JSON.parse(payload));
        console.log(`Batch submitted: ${(result as any).created} items created`);
      }

      const result = await client.post(`/api/prs/${prId}/agent-ready`);
      console.log(`PR ready for review (cycle ${(result as any).cycleNumber})`);
    });
}
