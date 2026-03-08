import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  generateSessionToken,
  writeSessionToken,
  readSessionToken,
  deleteSessionToken,
} from '../session-token.js';

describe('session-token', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'shepherd-token-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('generates a 64-char hex token', () => {
    const token = generateSessionToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates unique tokens', () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
  });

  it('writes and reads a token', () => {
    writeSessionToken(tempDir, 'test-token-123');
    const result = readSessionToken(tempDir);
    expect(result).toBe('test-token-123');
  });

  it('deletes a token file', () => {
    writeSessionToken(tempDir, 'to-delete');
    deleteSessionToken(tempDir);
    expect(existsSync(join(tempDir, 'session-token'))).toBe(false);
  });

  it('delete ignores missing file', () => {
    expect(() => { deleteSessionToken(tempDir); }).not.toThrow();
  });
});
