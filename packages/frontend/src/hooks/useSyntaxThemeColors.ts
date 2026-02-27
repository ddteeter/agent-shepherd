import { useEffect } from 'react';
import { bundledThemes } from 'shiki';

/** Map CSS custom properties to shiki theme color keys (fallback chains). */
const COLOR_MAP: [string, string[]][] = [
  ['--color-bg', ['editor.background']],
  ['--color-bg-secondary', ['sideBar.background', 'editorWidget.background']],
  ['--color-text', ['editor.foreground']],
  ['--color-border', ['panel.border', 'editorGroup.border', 'sideBar.border']],
  ['--color-accent', ['textLink.foreground', 'focusBorder', 'button.background']],
  ['--color-success', ['terminal.ansiGreen']],
  ['--color-warning', ['terminal.ansiYellow', 'editorWarning.foreground']],
  ['--color-danger', ['terminal.ansiRed', 'editorError.foreground']],
  ['--color-diff-add-bg', ['diffEditor.insertedLineBackground', 'diffEditor.insertedTextBackground']],
  ['--color-diff-add-line', ['editorGutter.addedBackground', 'terminal.ansiGreen']],
  ['--color-diff-remove-bg', ['diffEditor.removedLineBackground', 'diffEditor.removedTextBackground']],
  ['--color-diff-remove-line', ['editorGutter.deletedBackground', 'terminal.ansiRed']],
  ['--color-diff-hunk-bg', ['editor.selectionBackground']],
  ['--color-btn-approve-bg', ['button.background']],
  ['--color-btn-approve-fg', ['button.foreground']],
  ['--color-btn-approve-hover', ['button.hoverBackground']],
  ['--color-btn-danger-bg', ['statusBarItem.errorBackground', 'errorForeground']],
  ['--color-btn-danger-fg', ['statusBarItem.errorForeground', 'button.foreground']],
  ['--color-btn-danger-hover', ['button.hoverBackground']],
  ['--color-list-hover-bg', ['list.hoverBackground']],
  ['--color-list-active-bg', ['list.activeSelectionBackground']],
  ['--color-list-active-fg', ['list.activeSelectionForeground']],
];

/**
 * Loads a shiki theme's color palette and applies it as CSS custom properties
 * on `document.documentElement`. Also sets `data-theme` to the theme's type
 * ('light' or 'dark') so Tailwind dark: classes work correctly.
 */
export function useSyntaxThemeColors(themeId: string) {
  useEffect(() => {
    let cancelled = false;

    const loader = bundledThemes[themeId as keyof typeof bundledThemes];
    if (!loader) return;

    loader().then((mod) => {
      if (cancelled) return;

      const theme = 'default' in mod ? mod.default : mod;
      const colors: Record<string, string> = (theme as any).colors ?? {};
      const type: string = (theme as any).type ?? 'dark';

      document.documentElement.setAttribute('data-theme', type);

      const style = document.documentElement.style;
      for (const [cssVar, keys] of COLOR_MAP) {
        const value = keys.reduce<string | undefined>(
          (found, key) => found ?? colors[key],
          undefined,
        );
        if (value) {
          style.setProperty(cssVar, value);
        } else {
          style.removeProperty(cssVar);
        }
      }
    });

    return () => { cancelled = true; };
  }, [themeId]);
}
