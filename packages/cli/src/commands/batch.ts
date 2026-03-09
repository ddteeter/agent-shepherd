import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { ApiClient } from '../api-client.js';

interface BatchResult {
  created: number;
}

export function batchCommand(program: Command, client: ApiClient) {
  program
    .command('batch <pr-id>')
    .description('Batch submit comments and replies')
    .option('-f, --file <path>', 'Path to JSON file with batch payload')
    .option('--stdin', 'Read batch payload from stdin')
    .action(
      async (prId: string, options: { file?: string; stdin?: boolean }) => {
        let payload: string;

        if (options.file) {
          payload = await readFile(options.file, 'utf8');
        } else if (options.stdin) {
          const chunks: Buffer[] = [];
          for await (const chunk of process.stdin) {
            chunks.push(chunk as Buffer);
          }
          payload = Buffer.concat(chunks).toString('utf8');
        } else {
          console.error('Must specify --file or --stdin');
          process.exitCode = 1;
          return;
        }

        const result = await client.post<BatchResult>(
          `/api/prs/${prId}/comments/batch`,
          JSON.parse(payload) as unknown,
        );
        console.log(`Batch submitted: ${String(result.created)} items created`);
      },
    );
}
