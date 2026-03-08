import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// From compiled dist/paths.js, 3 levels up reaches the package/repo root
export const PACKAGE_ROOT = resolve(__dirname, '../../..');
export const SKILLS_DIR = resolve(PACKAGE_ROOT, 'skills');
export const BACKEND_DIST = resolve(PACKAGE_ROOT, 'packages/backend/dist');
export const FRONTEND_DIST = resolve(PACKAGE_ROOT, 'packages/frontend/dist');

/** True when running from a git checkout (dev mode) vs an npm install */
export function isDevMode(): boolean {
  return existsSync(resolve(PACKAGE_ROOT, '.git'));
}
