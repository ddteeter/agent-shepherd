import { Command } from 'commander';
import { ApiClient } from '../api-client.js';

interface FileGroup {
  name: string;
  files: string[];
}

interface FileGroupsResult {
  fileGroups: FileGroup[] | undefined;
  cycleNumber: number;
}

export function fileGroupsCommand(program: Command, client: ApiClient) {
  program
    .command('file-groups <pr-id>')
    .description('Fetch file groups for a PR (from latest cycle)')
    .option('--cycle <number>', 'Specific cycle number')
    .action(async (prId: string, options: { cycle?: string }) => {
      const parameters = options.cycle ? `?cycle=${options.cycle}` : '';
      const result = await client.get<FileGroupsResult>(
        `/api/prs/${prId}/file-groups${parameters}`,
      );

      if (!result.fileGroups) {
        console.log('No file groups defined for this PR.');
        return;
      }

      console.log(JSON.stringify(result.fileGroups, undefined, 2));
    });
}
