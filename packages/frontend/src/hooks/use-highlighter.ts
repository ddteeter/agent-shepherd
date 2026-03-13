import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  createHighlighter,
  type Highlighter,
  type ThemedToken,
  type BundledTheme,
  bundledThemes,
} from 'shiki';

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  json: 'json',
  md: 'markdown',
  css: 'css',
  html: 'html',
  yml: 'yaml',
  yaml: 'yaml',
  sh: 'bash',
  bash: 'bash',
  sql: 'sql',
  py: 'python',
  rs: 'rust',
  go: 'go',
  toml: 'toml',
  gitignore: 'text',
};

export function getLangFromPath(filePath: string): string {
  const extension = filePath.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TO_LANG[extension] ?? 'text';
}

export function getLanguagesForFiles(filePaths: string[]): string[] {
  const langs = new Set<string>();
  for (const fp of filePaths) {
    const lang = getLangFromPath(fp);
    if (lang !== 'text') langs.add(lang);
  }
  return [...langs];
}

export type TokenizedLine = ThemedToken[];

export const AVAILABLE_THEMES: string[] = (
  Object.keys(bundledThemes) as unknown as { toSorted: () => string[] }
).toSorted();

export const THEME_GROUPS: {
  label: string;
  themes: { id: string; name: string }[];
}[] = [
  {
    label: 'GitHub',
    themes: [
      { id: 'github-light', name: 'GitHub Light' },
      { id: 'github-dark', name: 'GitHub Dark' },
      { id: 'github-dark-dimmed', name: 'GitHub Dark Dimmed' },
      { id: 'github-dark-high-contrast', name: 'GitHub Dark HC' },
      { id: 'github-light-high-contrast', name: 'GitHub Light HC' },
    ],
  },
  {
    label: 'Popular',
    themes: [
      { id: 'nord', name: 'Nord' },
      { id: 'dracula', name: 'Dracula' },
      { id: 'dracula-soft', name: 'Dracula Soft' },
      { id: 'one-dark-pro', name: 'One Dark Pro' },
      { id: 'one-light', name: 'One Light' },
      { id: 'monokai', name: 'Monokai' },
      { id: 'night-owl', name: 'Night Owl' },
      { id: 'night-owl-light', name: 'Night Owl Light' },
      { id: 'tokyo-night', name: 'Tokyo Night' },
      { id: 'vitesse-dark', name: 'Vitesse Dark' },
      { id: 'vitesse-light', name: 'Vitesse Light' },
    ],
  },
  {
    label: 'Catppuccin',
    themes: [
      { id: 'catppuccin-latte', name: 'Latte' },
      { id: 'catppuccin-frappe', name: 'Frappé' },
      { id: 'catppuccin-macchiato', name: 'Macchiato' },
      { id: 'catppuccin-mocha', name: 'Mocha' },
    ],
  },
  {
    label: 'Solarized',
    themes: [
      { id: 'solarized-light', name: 'Solarized Light' },
      { id: 'solarized-dark', name: 'Solarized Dark' },
    ],
  },
  {
    label: 'Material',
    themes: [
      { id: 'material-theme', name: 'Material' },
      { id: 'material-theme-darker', name: 'Material Darker' },
      { id: 'material-theme-lighter', name: 'Material Lighter' },
      { id: 'material-theme-ocean', name: 'Material Ocean' },
      { id: 'material-theme-palenight', name: 'Material Palenight' },
    ],
  },
  {
    label: 'Other',
    themes: [
      { id: 'rose-pine', name: 'Rosé Pine' },
      { id: 'rose-pine-dawn', name: 'Rosé Pine Dawn' },
      { id: 'rose-pine-moon', name: 'Rosé Pine Moon' },
      { id: 'gruvbox-dark-medium', name: 'Gruvbox Dark' },
      { id: 'gruvbox-light-medium', name: 'Gruvbox Light' },
      { id: 'everforest-dark', name: 'Everforest Dark' },
      { id: 'everforest-light', name: 'Everforest Light' },
      { id: 'kanagawa-wave', name: 'Kanagawa Wave' },
      { id: 'poimandres', name: 'Poimandres' },
      { id: 'ayu-dark', name: 'Ayu Dark' },
      { id: 'ayu-light', name: 'Ayu Light' },
      { id: 'synthwave-84', name: 'Synthwave 84' },
      { id: 'houston', name: 'Houston' },
      { id: 'snazzy-light', name: 'Snazzy Light' },
    ],
  },
];

const SYNTAX_THEME_KEY = 'shepherd-syntax-theme';

export function getStoredSyntaxTheme(): string {
  try {
    return localStorage.getItem(SYNTAX_THEME_KEY) ?? 'github-dark';
  } catch {
    return 'github-dark';
  }
}

export function useHighlighter(filePaths: string[]) {
  const [highlighter, setHighlighter] = useState<Highlighter | undefined>();
  const [ready, setReady] = useState(false);
  const [syntaxTheme, setSyntaxThemeState] = useState(getStoredSyntaxTheme);
  const loadedThemes = useRef(new Set<string>());
  const tokenCache = useRef(new Map<string, TokenizedLine | undefined>());
  const langs = useMemo(() => getLanguagesForFiles(filePaths), [filePaths]);
  const noCodeLanguages = langs.length === 0;

  // Set ready immediately when there are no code languages to highlight
  if (noCodeLanguages && !ready) {
    setReady(true);
  }

  useEffect(() => {
    if (noCodeLanguages) return;
    let disposed = false;

    void createHighlighter({
      themes: [syntaxTheme],
      langs,
    })
      .then((hl) => {
        if (!disposed) {
          loadedThemes.current.add(syntaxTheme);
          setHighlighter(hl);
          setReady(true);
        }
      })
      .catch(() => {
        if (!disposed) setReady(true);
      });

    return () => {
      disposed = true;
    };
  }, [filePaths, noCodeLanguages, langs, syntaxTheme]);

  useEffect(() => {
    tokenCache.current.clear();
    if (!highlighter || loadedThemes.current.has(syntaxTheme)) return;

    void highlighter
      .loadTheme(syntaxTheme as BundledTheme)
      .then(() => {
        loadedThemes.current.add(syntaxTheme);
        setReady(false);
        requestAnimationFrame(() => {
          setReady(true);
        });
      })
      .catch(() => {
        // Fall back gracefully
      });
  }, [syntaxTheme, highlighter]);

  useEffect(() => {
    const handler = (event: StorageEvent) => {
      if (event.key === SYNTAX_THEME_KEY && event.newValue) {
        setSyntaxThemeState(event.newValue);
      }
    };
    globalThis.addEventListener('storage', handler);
    return () => {
      globalThis.removeEventListener('storage', handler);
    };
  }, []);

  const setSyntaxTheme = useCallback((theme: string) => {
    setSyntaxThemeState(theme);
    try {
      localStorage.setItem(SYNTAX_THEME_KEY, theme);
    } catch {
      // localStorage unavailable
    }
  }, []);

  const tokenizeLine = useCallback(
    (code: string, lang: string): TokenizedLine | undefined => {
      if (!highlighter || !loadedThemes.current.has(syntaxTheme))
        return undefined;
      const cacheKey = `${syntaxTheme}\0${lang}\0${code}`;
      const cached = tokenCache.current.get(cacheKey);
      if (cached !== undefined) return cached;
      try {
        const result = highlighter.codeToTokens(code, {
          lang: lang as Parameters<Highlighter['codeToTokens']>[1]['lang'],
          theme: syntaxTheme as BundledTheme,
        });
        const tokens = result.tokens[0] ?? [];
        tokenCache.current.set(cacheKey, tokens);
        return tokens;
      } catch {
        tokenCache.current.set(cacheKey, undefined);
        return undefined;
      }
    },
    [highlighter, syntaxTheme],
  );

  return { ready, tokenizeLine, syntaxTheme, setSyntaxTheme };
}
