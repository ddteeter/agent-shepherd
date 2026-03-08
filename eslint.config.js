import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import unicorn from 'eslint-plugin-unicorn';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      '**/node_modules/',
      '**/dist/',
      '**/coverage/',
      '**/drizzle/',
      '**/*.db',
      '**/*.config.js',
      '**/*.config.ts',
      '**/vite-env.d.ts',
    ],
  },

  // Base configs for all TS files
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  unicorn.configs['flat/recommended'],

  // TypeScript parser options — point at each package's tsconfig
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // React-specific rules (frontend only)
  {
    files: ['packages/frontend/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },

  // Disable prettier-conflicting rules (must be last)
  eslintConfigPrettier,
);
