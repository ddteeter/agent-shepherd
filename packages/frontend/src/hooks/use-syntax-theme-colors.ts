import { useEffect } from 'react';
import { bundledThemes } from 'shiki';

const COLOR_MAP: [string, string[]][] = [
  ['--color-bg', ['editor.background']],
  ['--color-bg-secondary', ['sideBar.background', 'editorWidget.background']],
  ['--color-text', ['editor.foreground']],
  ['--color-border', ['panel.border', 'editorGroup.border', 'sideBar.border']],
  [
    '--color-accent',
    ['textLink.foreground', 'focusBorder', 'button.background'],
  ],
  ['--color-success', ['terminal.ansiGreen']],
  ['--color-warning', ['terminal.ansiYellow', 'editorWarning.foreground']],
  ['--color-danger', ['terminal.ansiRed', 'editorError.foreground']],
  [
    '--color-diff-add-bg',
    ['diffEditor.insertedLineBackground', 'diffEditor.insertedTextBackground'],
  ],
  [
    '--color-diff-add-line',
    ['editorGutter.addedBackground', 'terminal.ansiGreen'],
  ],
  [
    '--color-diff-remove-bg',
    ['diffEditor.removedLineBackground', 'diffEditor.removedTextBackground'],
  ],
  [
    '--color-diff-remove-line',
    ['editorGutter.deletedBackground', 'terminal.ansiRed'],
  ],
  ['--color-diff-hunk-bg', ['editor.selectionBackground']],
  ['--color-btn-approve-bg', ['button.background']],
  ['--color-btn-approve-fg', ['button.foreground']],
  ['--color-btn-approve-hover', ['button.hoverBackground']],
  [
    '--color-btn-danger-bg',
    ['statusBarItem.errorBackground', 'errorForeground'],
  ],
  [
    '--color-btn-danger-fg',
    ['statusBarItem.errorForeground', 'button.foreground'],
  ],
  ['--color-btn-danger-hover', ['button.hoverBackground']],
  ['--color-list-hover-bg', ['list.hoverBackground']],
  ['--color-list-active-bg', ['list.activeSelectionBackground']],
  ['--color-list-active-fg', ['list.activeSelectionForeground']],
];

interface ThemeModule {
  default?: ThemeData;
  type?: string;
  colors?: Record<string, string>;
}

interface ThemeData {
  type?: string;
  colors?: Record<string, string>;
}

export function useSyntaxThemeColors(themeId: string) {
  useEffect(() => {
    let cancelled = false;

    const loader = bundledThemes[themeId as keyof typeof bundledThemes] as
      | (() => Promise<ThemeModule>)
      | undefined;
    if (!loader) return;

    void loader().then((module_: ThemeModule) => {
      if (cancelled) return;

      const theme: ThemeData = module_.default ?? module_;
      const colors: Record<string, string> = theme.colors ?? {};
      const type: string = theme.type ?? 'dark';

      document.documentElement.dataset.theme = type;

      const style = document.documentElement.style;
      for (const [cssVariable, keys] of COLOR_MAP) {
        let value: string | undefined;
        for (const key of keys) {
          if (colors[key]) {
            value = colors[key];
            break;
          }
        }
        if (value) {
          style.setProperty(cssVariable, value);
        } else {
          style.removeProperty(cssVariable);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [themeId]);
}
