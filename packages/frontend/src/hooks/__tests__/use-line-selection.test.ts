import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLineSelection } from '../use-line-selection.js';

describe('useLineSelection', () => {
  it('returns initial state with no selection', () => {
    const { result } = renderHook(() => useLineSelection({}));
    expect(result.current.commentFormLine).toBeUndefined();
    expect(result.current.dragSelection).toBeUndefined();
    expect(result.current.buttonsHidden).toBe(false);
    expect(result.current.fileCommentFormPath).toBeUndefined();
  });

  it('sets comment form on line click', () => {
    const { result } = renderHook(() =>
      useLineSelection({ onAddComment: vi.fn() }),
    );
    act(() => {
      result.current.handleLineClick('file.ts', 5, false, 'new');
    });
    expect(result.current.commentFormLine).toEqual({
      file: 'file.ts',
      startLine: 5,
      endLine: 5,
      side: 'new',
    });
  });

  it('extends range on shift-click in same file and side', () => {
    const { result } = renderHook(() =>
      useLineSelection({ onAddComment: vi.fn() }),
    );
    act(() => {
      result.current.handleLineClick('file.ts', 3, false, 'new');
    });
    act(() => {
      result.current.handleLineClick('file.ts', 7, true, 'new');
    });
    expect(result.current.commentFormLine).toEqual({
      file: 'file.ts',
      startLine: 3,
      endLine: 7,
      side: 'new',
    });
  });

  it('clears selection on cancel', () => {
    const { result } = renderHook(() =>
      useLineSelection({ onAddComment: vi.fn() }),
    );
    act(() => {
      result.current.handleLineClick('file.ts', 5, false, 'new');
    });
    act(() => {
      result.current.handleCancelComment();
    });
    expect(result.current.commentFormLine).toBeUndefined();
    expect(result.current.buttonsHidden).toBe(true);
  });

  it('calls onAddComment and clears form on handleAddComment', () => {
    const onAdd = vi.fn();
    const { result } = renderHook(() =>
      useLineSelection({ onAddComment: onAdd }),
    );
    act(() => {
      result.current.handleAddComment(
        'file.ts',
        1,
        3,
        'body',
        'suggestion',
        'new',
      );
    });
    expect(onAdd).toHaveBeenCalledWith({
      filePath: 'file.ts',
      startLine: 1,
      endLine: 3,
      body: 'body',
      type: 'suggestion',
      side: 'new',
    });
  });

  it('manages fileCommentFormPath', () => {
    const { result } = renderHook(() => useLineSelection({}));
    act(() => {
      result.current.setFileCommentFormPath('src/app.ts');
    });
    expect(result.current.fileCommentFormPath).toBe('src/app.ts');
  });
});
