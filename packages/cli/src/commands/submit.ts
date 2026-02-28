import { Command } from 'commander';
import { readFile } from 'fs/promises';
import { ApiClient } from '../api-client.js';

export function submitCommand(program: Command, client: ApiClient) {
  program
    .command('submit')
    .description('Submit a PR from current branch')
    .requiredOption('-p, --project <id>', 'Project ID')
    .option('-t, --title <title>', 'PR title')
    .option('-d, --description <desc>', 'PR description', '')
    .option('-s, --source-branch <branch>', 'Source branch (auto-detected if omitted)')
    .option('-c, --context-file <path>', 'Path to JSON file with agent context')
    .action(async (opts) => {
      let agentContext: string | undefined;
      if (opts.contextFile) {
        agentContext = await readFile(opts.contextFile, 'utf-8');
      }

      const pr = await client.post(`/api/projects/${opts.project}/prs`, {
        title: opts.title || 'Agent PR',
        description: opts.description,
        sourceBranch: opts.sourceBranch || 'HEAD',
        agentContext,
        workingDirectory: process.cwd(),
      });

      console.log(`PR created: ${(pr as any).id}`);
      console.log(`Title: ${(pr as any).title}`);
      console.log(`Status: ${(pr as any).status}`);
    });
}
