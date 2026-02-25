import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createHighlighter, type Highlighter, type ThemedToken, bundledThemes } from 'shiki';

/** Map file extensions to shiki language IDs */
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
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return EXT_TO_LANG[ext] || 'text';
}

/** Collect unique languages needed for a set of file paths */
export function getLanguagesForFiles(filePaths: string[]): string[] {
  const langs = new Set<string>();
  for (const fp of filePaths) {
    const lang = getLangFromPath(fp);
    if (lang !== 'text') langs.add(lang);
  }
  return [...langs];
}

export type TokenizedLine = ThemedToken[];

/** All available shiki theme IDs */
export const AVAILABLE_THEMES = Object.keys(bundledThemes).sort();

/** Curated themes grouped by type for the selector UI */
export const THEME_GROUPS: { label: string; themes: { id: string; name: string }[] }[] = [
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
    return localStorage.getItem(SYNTAX_THEME_KEY) || 'github-dark';
  } catch {
    return 'github-dark';
  }
}

export function useHighlighter(filePaths: string[]) {
  const [highlighter, setHighlighter] = useState<Highlighter | null>(null);
  const [ready, setReady] = useState(false);
  const [syntaxTheme, setSyntaxThemeState] = useState(getStoredSyntaxTheme);
  const loadedThemes = useRef(new Set<string>());

  // Initialize highlighter with the current theme
  useEffect(() => {
    let disposed = false;

    const langs = getLanguagesForFiles(filePaths);
    if (langs.length === 0) {
      setReady(true);
      return;
    }

    createHighlighter({
      themes: [syntaxTheme],
      langs,
    }).then((hl) => {
      if (!disposed) {
        loadedThemes.current.add(syntaxTheme);
        setHighlighter(hl);
        setReady(true);
      }
    }).catch(() => {
      if (!disposed) setReady(true);
    });

    return () => { disposed = true; };
  }, [filePaths.join(',')]);

  // Load a new theme into the existing highlighter when syntaxTheme changes
  useEffect(() => {
    if (!highlighter || loadedThemes.current.has(syntaxTheme)) return;

    highlighter.loadTheme(syntaxTheme as any).then(() => {
      loadedThemes.current.add(syntaxTheme);
      // Force re-render by toggling ready
      setReady(false);
      requestAnimationFrame(() => setReady(true));
    }).catch(() => {
      // Fall back gracefully
    });
  }, [syntaxTheme, highlighter]);

  // Listen for storage events from the App-level theme selector
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === SYNTAX_THEME_KEY && e.newValue) {
        setSyntaxThemeState(e.newValue);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const setSyntaxTheme = useCallback((theme: string) => {
    setSyntaxThemeState(theme);
    try {
      localStorage.setItem(SYNTAX_THEME_KEY, theme);
    } catch {
      // localStorage unavailable
    }
  }, []);

  /** Tokenize a single line of code */
  const tokenizeLine = useCallback((code: string, lang: string, _theme?: string): TokenizedLine | null => {
    if (!highlighter || !loadedThemes.current.has(syntaxTheme)) return null;
    try {
      const result = highlighter.codeToTokens(code, { lang: lang as any, theme: syntaxTheme as any });
      return result.tokens[0] || [];
    } catch {
      return null;
    }
  }, [highlighter, syntaxTheme]);

  /** Get the theme's background and foreground colors so the diff area can match */
  const { themeBg, themeFg } = useMemo(() => {
    if (!highlighter || !loadedThemes.current.has(syntaxTheme)) return { themeBg: undefined, themeFg: undefined };
    try {
      const t = highlighter.getTheme(syntaxTheme as any);
      return { themeBg: t.bg, themeFg: t.fg };
    }
    catch { return { themeBg: undefined, themeFg: undefined }; }
  }, [highlighter, syntaxTheme, ready]);

  return { ready, tokenizeLine, syntaxTheme, setSyntaxTheme, themeBg, themeFg };
}
