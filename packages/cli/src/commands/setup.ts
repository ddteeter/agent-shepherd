import { Command } from 'commander';
import { execSync } from 'child_process';
import { PACKAGE_ROOT, isDevMode } from '../paths.js';

export function setupCommand(program: Command) {
  program
    .command('setup')
    .description('Install skills and verify prerequisites')
    .action(async () => {
      const results: Array<{ label: string; ok: boolean; detail?: string }> = [];

      // 1. Verify claude is on PATH
      try {
        const version = execSync('claude --version', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
        results.push({ label: 'Claude CLI', ok: true, detail: version });
      } catch {
        results.push({ label: 'Claude CLI', ok: false, detail: 'claude not found on PATH — install from https://docs.anthropic.com/en/docs/claude-code' });
      }

      // 2. Install skills via npx skills
      try {
        execSync(`npx skills add ${PACKAGE_ROOT} --global -a claude-code --yes`, {
          encoding: 'utf-8',
          stdio: 'inherit',
        });
        results.push({ label: 'Skills install', ok: true });
      } catch {
        results.push({ label: 'Skills install', ok: false, detail: 'npx skills add failed — ensure npx is available' });
      }

      // 3. In dev mode, npm link to put agent-shepherd on PATH
      if (isDevMode()) {
        try {
          execSync('npm link', { cwd: PACKAGE_ROOT, encoding: 'utf-8', stdio: 'inherit' });
          results.push({ label: 'npm link (dev)', ok: true });
        } catch {
          results.push({ label: 'npm link (dev)', ok: false, detail: 'npm link failed — try running with sudo or fix npm permissions' });
        }
      }

      // Print summary
      console.log('\n--- Setup Summary ---');
      for (const r of results) {
        const icon = r.ok ? '[OK]' : '[FAIL]';
        const detail = r.detail ? ` — ${r.detail}` : '';
        console.log(`  ${icon} ${r.label}${detail}`);
      }

      const failed = results.filter(r => !r.ok);
      if (failed.length > 0) {
        console.log(`\n${failed.length} step(s) failed. Fix the issues above and re-run: agent-shepherd setup`);
        process.exit(1);
      } else {
        console.log('\nSetup complete!');
      }
    });
}
