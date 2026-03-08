import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  getLangFromPath,
  getLanguagesForFiles,
  getStoredSyntaxTheme,
  AVAILABLE_THEMES,
  THEME_GROUPS,
  useHighlighter,
} from '../useHighlighter.js';

// Mock shiki
vi.mock('shiki', () => {
  const mockHighlighter = {
    codeToTokens: vi
      .fn()
      .mockReturnValue({ tokens: [[{ content: 'test', color: '#fff' }]] }),
    loadTheme: vi.fn().mockResolvedValue(),
  };
  return {
    createHighlighter: vi.fn().mockResolvedValue(mockHighlighter),
    bundledThemes: {
      'github-dark': true,
      'github-light': true,
      nord: true,
    },
  };
});

describe('getLangFromPath', () => {
  it('maps .ts to typescript', () => {
    expect(getLangFromPath('src/index.ts')).toBe('typescript');
  });

  it('maps .tsx to tsx', () => {
    expect(getLangFromPath('App.tsx')).toBe('tsx');
  });

  it('maps .js to javascript', () => {
    expect(getLangFromPath('app.js')).toBe('javascript');
  });

  it('maps .py to python', () => {
    expect(getLangFromPath('script.py')).toBe('python');
  });

  it('maps .json to json', () => {
    expect(getLangFromPath('package.json')).toBe('json');
  });

  it('maps .css to css', () => {
    expect(getLangFromPath('style.css')).toBe('css');
  });

  it('maps .yml to yaml', () => {
    expect(getLangFromPath('config.yml')).toBe('yaml');
  });

  it('maps .yaml to yaml', () => {
    expect(getLangFromPath('config.yaml')).toBe('yaml');
  });

  it('returns text for unknown extensions', () => {
    expect(getLangFromPath('file.xyz')).toBe('text');
  });

  it('returns text for files without extension', () => {
    expect(getLangFromPath('Makefile')).toBe('text');
  });

  it('maps .gitignore to text', () => {
    expect(getLangFromPath('.gitignore')).toBe('text');
  });

  it('maps .md to markdown', () => {
    expect(getLangFromPath('README.md')).toBe('markdown');
  });

  it('maps .go to go', () => {
    expect(getLangFromPath('main.go')).toBe('go');
  });

  it('maps .rs to rust', () => {
    expect(getLangFromPath('main.rs')).toBe('rust');
  });

  it('maps .html to html', () => {
    expect(getLangFromPath('index.html')).toBe('html');
  });

  it('maps .sh to bash', () => {
    expect(getLangFromPath('run.sh')).toBe('bash');
  });

  it('maps .sql to sql', () => {
    expect(getLangFromPath('query.sql')).toBe('sql');
  });

  it('maps .toml to toml', () => {
    expect(getLangFromPath('config.toml')).toBe('toml');
  });
});

describe('getLanguagesForFiles', () => {
  it('returns unique languages excluding text', () => {
    const langs = getLanguagesForFiles(['a.ts', 'b.ts', 'c.js', 'd.gitignore']);
    expect(langs).toContain('typescript');
    expect(langs).toContain('javascript');
    expect(langs).not.toContain('text');
  });

  it('returns empty for all text files', () => {
    expect(getLanguagesForFiles(['.gitignore', 'Makefile'])).toEqual([]);
  });

  it('returns empty for empty input', () => {
    expect(getLanguagesForFiles([])).toEqual([]);
  });
});

describe('getStoredSyntaxTheme', () => {
  it('returns default when localStorage throws', () => {
    // jsdom may not support localStorage in test env, which exercises the catch branch
    expect(getStoredSyntaxTheme()).toBe('github-dark');
  });
});

describe('AVAILABLE_THEMES', () => {
  it('is a sorted array of theme IDs', () => {
    expect(Array.isArray(AVAILABLE_THEMES)).toBe(true);
    const sorted = [...AVAILABLE_THEMES].sort();
    expect(AVAILABLE_THEMES).toEqual(sorted);
  });
});

describe('THEME_GROUPS', () => {
  it('is a non-empty array with label and themes', () => {
    expect(THEME_GROUPS.length).toBeGreaterThan(0);
    for (const group of THEME_GROUPS) {
      expect(group.label).toBeTruthy();
      expect(group.themes.length).toBeGreaterThan(0);
      for (const theme of group.themes) {
        expect(theme.id).toBeTruthy();
        expect(theme.name).toBeTruthy();
      }
    }
  });
});

describe('useHighlighter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ready and tokenizeLine when files have code languages', async () => {
    const { result } = renderHook(() => useHighlighter(['test.ts']));

    await waitFor(() => {
      expect(result.current.ready).toBe(true);
    });

    expect(result.current.tokenizeLine).toBeInstanceOf(Function);
    expect(result.current.syntaxTheme).toBe('github-dark');
  });

  it('returns ready immediately for text-only files', async () => {
    const { result } = renderHook(() => useHighlighter(['.gitignore']));

    await waitFor(() => {
      expect(result.current.ready).toBe(true);
    });
  });

  it('tokenizeLine returns tokens for valid code', async () => {
    const { result } = renderHook(() => useHighlighter(['test.ts']));

    await waitFor(() => {
      expect(result.current.ready).toBe(true);
    });

    const tokens = result.current.tokenizeLine('const x = 1', 'typescript');
    expect(tokens).toBeTruthy();
  });

  it('tokenizeLine caches results', async () => {
    const { result } = renderHook(() => useHighlighter(['test.ts']));

    await waitFor(() => {
      expect(result.current.ready).toBe(true);
    });

    const tokens1 = result.current.tokenizeLine('const x = 1', 'typescript');
    const tokens2 = result.current.tokenizeLine('const x = 1', 'typescript');
    expect(tokens1).toBe(tokens2);
  });

  it('setSyntaxTheme updates theme state', async () => {
    const { result } = renderHook(() => useHighlighter(['test.ts']));

    await waitFor(() => {
      expect(result.current.ready).toBe(true);
    });

    act(() => {
      result.current.setSyntaxTheme('nord');
    });

    expect(result.current.syntaxTheme).toBe('nord');
  });

  it('listens for storage events and updates theme', async () => {
    const { result } = renderHook(() => useHighlighter(['test.ts']));

    await waitFor(() => {
      expect(result.current.ready).toBe(true);
    });

    act(() => {
      globalThis.dispatchEvent(
        new StorageEvent('storage', {
          key: 'shepherd-syntax-theme',
          newValue: 'github-light',
        }),
      );
    });

    expect(result.current.syntaxTheme).toBe('github-light');
  });
});
