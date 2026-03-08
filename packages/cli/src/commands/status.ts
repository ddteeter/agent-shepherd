import { Command } from 'commander';
import { ApiClient } from '../api-client.js';

export function statusCommand(program: Command, client: ApiClient) {
  program
    .command('status <pr-id>')
    .description('Check PR status')
    .action(async (prId: string) => {
      const pr = await client.get<any>(`/api/prs/${prId}`);
      const cycles = await client.get<any[]>(`/api/prs/${prId}/cycles`);
      const currentCycle = cycles[cycles.length - 1];

      console.log(`PR: ${pr.title}`);
      console.log(`Status: ${pr.status}`);
      console.log(`Branch: ${pr.sourceBranch} -> ${pr.baseBranch}`);
      console.log(
        `Review Cycle: ${currentCycle?.cycleNumber || 0} (${currentCycle?.status || 'none'})`,
      );
    });
}
