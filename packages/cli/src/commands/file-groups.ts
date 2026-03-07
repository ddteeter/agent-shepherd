import { Command } from 'commander';
import { ApiClient } from '../api-client.js';

export function fileGroupsCommand(program: Command, client: ApiClient) {
  program
    .command('file-groups <pr-id>')
    .description('Fetch file groups for a PR (from latest cycle)')
    .option('--cycle <number>', 'Specific cycle number')
    .action(async (prId: string, opts: { cycle?: string }) => {
      const params = opts.cycle ? `?cycle=${opts.cycle}` : '';
      const result = await client.get<{ fileGroups: any[] | null; cycleNumber: number }>(
        `/api/prs/${prId}/file-groups${params}`,
      );

      if (!result.fileGroups) {
        console.log('No file groups defined for this PR.');
        return;
      }

      console.log(JSON.stringify(result.fileGroups, null, 2));
    });
}
