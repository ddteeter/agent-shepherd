import { Command } from 'commander';
import { execSync } from 'node:child_process';
import { PACKAGE_ROOT, isDevelopmentMode } from '../paths.js';

export function setupCommand(program: Command) {
  program
    .command('setup')
    .description('Install skills and verify prerequisites')
    .action(() => {
      const results: { label: string; ok: boolean; detail?: string }[] = [];

      try {
        const version = execSync('claude --version', {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
        results.push({ label: 'Claude CLI', ok: true, detail: version });
      } catch {
        results.push({
          label: 'Claude CLI',
          ok: false,
          detail:
            'claude not found on PATH — install from https://docs.anthropic.com/en/docs/claude-code',
        });
      }

      try {
        execSync(
          `npx skills add ${PACKAGE_ROOT} --global -a claude-code --yes`,
          {
            encoding: 'utf8',
            stdio: 'inherit',
          },
        );
        results.push({ label: 'Skills install', ok: true });
      } catch {
        results.push({
          label: 'Skills install',
          ok: false,
          detail: 'npx skills add failed — ensure npx is available',
        });
      }

      if (isDevelopmentMode()) {
        try {
          execSync('npm link', {
            cwd: PACKAGE_ROOT,
            encoding: 'utf8',
            stdio: 'inherit',
          });
          results.push({ label: 'npm link (dev)', ok: true });
        } catch {
          results.push({
            label: 'npm link (dev)',
            ok: false,
            detail:
              'npm link failed — try running with sudo or fix npm permissions',
          });
        }
      }

      console.log('\n--- Setup Summary ---');
      for (const r of results) {
        const icon = r.ok ? '[OK]' : '[FAIL]';
        const detail = r.detail ? ` — ${r.detail}` : '';
        console.log(`  ${icon} ${r.label}${detail}`);
      }

      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        console.log(
          `\n${String(failed.length)} step(s) failed. Fix the issues above and re-run: agent-shepherd setup`,
        );
        process.exitCode = 1;
        return;
      } else {
        console.log('\nSetup complete!');
      }
    });
}
