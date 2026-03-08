import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function shepherdTokenPlugin(): Plugin {
  return {
    name: 'shepherd-session-token',
    transformIndexHtml(html) {
      try {
        const token = readFileSync(
          join(homedir(), '.agent-shepherd', 'session-token'),
          'utf-8',
        ).trim();
        return html.replace(
          '</head>',
          `<script>window.__SHEPHERD_TOKEN__="${token}"</script></head>`,
        );
      } catch {
        // Token file not found — server may not be running yet
        return html;
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), shepherdTokenPlugin()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/__tests__/**', 'src/**/*.test.{ts,tsx}', 'src/test-setup.ts', 'src/main.tsx'],
      all: true,
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
  server: {
    port: 3848,
    proxy: {
      '/api': 'http://localhost:3847',
      '/ws': { target: 'ws://localhost:3847', ws: true },
    },
  },
});
