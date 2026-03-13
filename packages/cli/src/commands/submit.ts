import { Command } from 'commander';
import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { ApiClient } from '../api-client.js';

interface SubmitOptions {
  project: string;
  title?: string;
  description: string;
  sourceBranch?: string;
  contextFile?: string;
  fileGroups?: string;
}

interface FileGroup {
  name: string;
  files: string[];
}

interface PrResult {
  id: string;
  title: string;
  status: string;
}

export function submitCommand(program: Command, client: ApiClient) {
  program
    .command('submit')
    .description('Submit a PR from current branch')
    .requiredOption('-p, --project <id>', 'Project ID')
    .option('-t, --title <title>', 'PR title')
    .option('-d, --description <desc>', 'PR description', '')
    .option(
      '-s, --source-branch <branch>',
      'Source branch (auto-detected if omitted)',
    )
    .option('-c, --context-file <path>', 'Path to JSON file with agent context')
    .option(
      '--file-groups <path>',
      'Path to JSON file with logical file groupings',
    )
    .action(async (options: SubmitOptions) => {
      let agentContext: string | undefined;
      if (options.contextFile) {
        agentContext = await readFile(options.contextFile, 'utf8');
      }

      let sourceBranch = options.sourceBranch;
      if (!sourceBranch) {
        try {
          sourceBranch = execSync('git rev-parse --abbrev-ref HEAD', {
            encoding: 'utf8',
          }).trim();
        } catch {
          sourceBranch = 'HEAD';
        }
      }

      let fileGroups: FileGroup[] | undefined;
      if (options.fileGroups) {
        const raw = await readFile(options.fileGroups, 'utf8');
        fileGroups = JSON.parse(raw) as FileGroup[];
      }

      const pr = await client.post<PrResult>(
        `/api/projects/${options.project}/prs`,
        {
          title: options.title ?? 'Agent PR',
          description: options.description,
          sourceBranch,
          agentContext,
          workingDirectory: process.cwd(),
          fileGroups,
        },
      );

      console.log(`PR created: ${pr.id}`);
      console.log(`Title: ${pr.title}`);
      console.log(`Status: ${pr.status}`);
    });
}
