import { Command } from 'commander';
import { readFile } from 'fs/promises';
import { ApiClient } from '../api-client.js';

export function batchCommand(program: Command, client: ApiClient) {
  program
    .command('batch <pr-id>')
    .description('Batch submit comments and replies')
    .option('-f, --file <path>', 'Path to JSON file with batch payload')
    .option('--stdin', 'Read batch payload from stdin')
    .action(async (prId: string, opts: { file?: string; stdin?: boolean }) => {
      let payload: string;

      if (opts.file) {
        payload = await readFile(opts.file, 'utf-8');
      } else if (opts.stdin) {
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk);
        }
        payload = Buffer.concat(chunks).toString('utf-8');
      } else {
        console.error('Must specify --file or --stdin');
        process.exit(1);
      }

      const result = await client.post(`/api/prs/${prId}/comments/batch`, JSON.parse(payload));
      console.log(`Batch submitted: ${(result as any).created} items created`);
    });
}
