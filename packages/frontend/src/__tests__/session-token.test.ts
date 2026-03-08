import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getSessionToken } from '../session-token.js';

describe('getSessionToken', () => {
  const original = (globalThis as any).__SHEPHERD_TOKEN__;

  afterEach(() => {
    if (original === undefined) {
      delete (globalThis as any).__SHEPHERD_TOKEN__;
    } else {
      (globalThis as any).__SHEPHERD_TOKEN__ = original;
    }
  });

  it('returns the token when set', () => {
    (globalThis as any).__SHEPHERD_TOKEN__ = 'test-token-123';
    expect(getSessionToken()).toBe('test-token-123');
  });

  it('throws when token is not set', () => {
    delete (globalThis as any).__SHEPHERD_TOKEN__;
    expect(() => getSessionToken()).toThrow('Session token not found');
  });

  it('throws when token is empty string', () => {
    (globalThis as any).__SHEPHERD_TOKEN__ = '';
    expect(() => getSessionToken()).toThrow('Session token not found');
  });
});
