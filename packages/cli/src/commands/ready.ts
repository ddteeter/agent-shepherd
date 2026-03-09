import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { ApiClient } from '../api-client.js';

interface BatchResult {
  created: number;
}

interface ReadyResult {
  cycleNumber: number;
}

interface FileGroup {
  name: string;
  files: string[];
}

export function readyCommand(program: Command, client: ApiClient) {
  program
    .command('ready <pr-id>')
    .description('Signal PR is ready for re-review')
    .option(
      '-f, --file <path>',
      'Batch comments JSON file to submit before signaling ready',
    )
    .option(
      '--file-groups <path>',
      'Path to JSON file with logical file groupings',
    )
    .action(
      async (prId: string, options: { file?: string; fileGroups?: string }) => {
        if (options.file) {
          const payload = await readFile(options.file, 'utf8');
          const result = await client.post<BatchResult>(
            `/api/prs/${prId}/comments/batch`,
            JSON.parse(payload) as unknown,
          );
          console.log(
            `Batch submitted: ${String(result.created)} items created`,
          );
        }

        let fileGroups: FileGroup[] | undefined;
        if (options.fileGroups) {
          const raw = await readFile(options.fileGroups, 'utf8');
          fileGroups = JSON.parse(raw) as FileGroup[];
        }

        const result = await client.post<ReadyResult>(
          `/api/prs/${prId}/agent-ready`,
          {
            fileGroups,
          },
        );
        console.log(
          `PR ready for review (cycle ${String(result.cycleNumber)})`,
        );
      },
    );
}
