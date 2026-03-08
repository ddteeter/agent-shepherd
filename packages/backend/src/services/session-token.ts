import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const TOKEN_FILENAME = 'session-token';

export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

export function writeSessionToken(dataDir: string, token: string): void {
  writeFileSync(join(dataDir, TOKEN_FILENAME), token, { mode: 0o600 });
}

export function readSessionToken(dataDir: string): string {
  return readFileSync(join(dataDir, TOKEN_FILENAME), 'utf-8').trim();
}

export function deleteSessionToken(dataDir: string): void {
  try {
    unlinkSync(join(dataDir, TOKEN_FILENAME));
  } catch (error: any) {
    if (error.code !== 'ENOENT') throw error;
  }
}
