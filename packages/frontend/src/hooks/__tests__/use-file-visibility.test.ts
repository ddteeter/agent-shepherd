import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFileVisibility } from '../use-file-visibility.js';
import type { FileDiffData } from '../../utils/diff-parser.js';

function makeFile(path: string): FileDiffData {
  return {
    path,
    hunks: [],
    lineCount: 10,
    additions: 5,
    deletions: 5,
    status: 'modified',
  };
}

describe('useFileVisibility', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'IntersectionObserver',
      vi.fn(() => ({
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
      })),
    );
  });

  it('returns initial empty visible set', () => {
    const { result } = renderHook(() =>
      useFileVisibility({
        parsedFiles: [makeFile('a.ts')],
        scrollToFile: undefined,
        scrollKey: 0,
      }),
    );
    expect(result.current.visible.size).toBe(0);
  });

  it('provides a containerRef', () => {
    const { result } = renderHook(() =>
      useFileVisibility({
        parsedFiles: [],
        scrollToFile: undefined,
        scrollKey: 0,
      }),
    );
    expect(result.current.containerRef).toBeDefined();
  });

  it('adds scrollToFile to visible set', () => {
    const { result } = renderHook(() =>
      useFileVisibility({
        parsedFiles: [makeFile('target.ts')],
        scrollToFile: 'target.ts',
        scrollKey: 1,
      }),
    );
    expect(result.current.visible.has('target.ts')).toBe(true);
  });
});
