import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSyntaxThemeColors } from '../use-syntax-theme-colors.js';

// Mock shiki bundledThemes
vi.mock('shiki', () => ({
  bundledThemes: {
    'github-dark': () =>
      Promise.resolve({
        default: {
          type: 'dark',
          colors: {
            'editor.background': '#24292e',
            'editor.foreground': '#e1e4e8',
            'panel.border': '#1b1f23',
            'textLink.foreground': '#79b8ff',
            'terminal.ansiGreen': '#85e89d',
            'terminal.ansiYellow': '#ffdf5d',
            'terminal.ansiRed': '#f97583',
            'diffEditor.insertedLineBackground': '#244032',
            'diffEditor.removedLineBackground': '#3d1e20',
            'button.background': '#176f2c',
            'button.foreground': '#ffffff',
          },
        },
      }),
    'github-light': () =>
      Promise.resolve({
        default: {
          type: 'light',
          colors: {
            'editor.background': '#ffffff',
            'editor.foreground': '#24292e',
          },
        },
      }),
    'no-default-theme': () =>
      Promise.resolve({
        type: 'dark',
        colors: {
          'editor.background': '#000000',
        },
      }),
  },
}));

describe('useSyntaxThemeColors', () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
    const style = document.documentElement.style;
    style.removeProperty('--color-bg');
    style.removeProperty('--color-text');
  });

  it('sets data-theme attribute based on theme type', async () => {
    renderHook(() => {
      useSyntaxThemeColors('github-dark');
    });

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('dark');
    });
  });

  it('sets CSS custom properties from theme colors', async () => {
    renderHook(() => {
      useSyntaxThemeColors('github-dark');
    });

    await waitFor(() => {
      const style = document.documentElement.style;
      expect(style.getPropertyValue('--color-bg')).toBe('#24292e');
      expect(style.getPropertyValue('--color-text')).toBe('#e1e4e8');
    });
  });

  it('removes CSS custom properties without matching theme colors', async () => {
    document.documentElement.style.setProperty('--color-border', '#test');
    renderHook(() => {
      useSyntaxThemeColors('github-light');
    });

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('light');
    });
  });

  it('does nothing for unknown theme IDs', () => {
    renderHook(() => {
      useSyntaxThemeColors('nonexistent-theme');
    });
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('handles theme modules without default export', async () => {
    renderHook(() => {
      useSyntaxThemeColors('no-default-theme');
    });

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('dark');
      expect(
        document.documentElement.style.getPropertyValue('--color-bg'),
      ).toBe('#000000');
    });
  });
});
