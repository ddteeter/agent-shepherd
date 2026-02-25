import { useState, useEffect } from 'react';
import { createHighlighter, type Highlighter, type ThemedToken } from 'shiki';

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

export function useHighlighter(filePaths: string[]) {
  const [highlighter, setHighlighter] = useState<Highlighter | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;

    const langs = getLanguagesForFiles(filePaths);
    if (langs.length === 0) {
      setReady(true);
      return;
    }

    createHighlighter({
      themes: ['github-dark', 'github-light'],
      langs,
    }).then((hl) => {
      if (!disposed) {
        setHighlighter(hl);
        setReady(true);
      }
    }).catch(() => {
      // If highlighter fails to load, degrade gracefully to plain text
      if (!disposed) setReady(true);
    });

    return () => { disposed = true; };
  }, [filePaths.join(',')]);

  /** Tokenize a single line of code for a given language and theme */
  function tokenizeLine(code: string, lang: string, theme: 'github-dark' | 'github-light'): TokenizedLine | null {
    if (!highlighter) return null;
    try {
      const result = highlighter.codeToTokens(code, { lang, theme });
      // codeToTokens returns tokens grouped by line; we only pass one line
      return result.tokens[0] || [];
    } catch {
      return null;
    }
  }

  return { ready, tokenizeLine, highlighter };
}
