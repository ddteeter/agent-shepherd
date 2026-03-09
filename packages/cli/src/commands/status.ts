import { Command } from 'commander';
import { ApiClient } from '../api-client.js';

interface PrStatus {
  title: string;
  status: string;
  sourceBranch: string;
  baseBranch: string;
}

interface ReviewCycle {
  cycleNumber: number;
  status: string;
}

export function statusCommand(program: Command, client: ApiClient) {
  program
    .command('status <pr-id>')
    .description('Check PR status')
    .action(async (prId: string) => {
      const pr = await client.get<PrStatus>(`/api/prs/${prId}`);
      const cycles = await client.get<ReviewCycle[]>(`/api/prs/${prId}/cycles`);
      const currentCycle = cycles.at(-1);

      console.log(`PR: ${pr.title}`);
      console.log(`Status: ${pr.status}`);
      console.log(`Branch: ${pr.sourceBranch} -> ${pr.baseBranch}`);
      console.log(
        `Review Cycle: ${String(currentCycle?.cycleNumber ?? 0)} (${currentCycle?.status ?? 'none'})`,
      );
    });
}
