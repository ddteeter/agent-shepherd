import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import unicorn from 'eslint-plugin-unicorn';
import sonarjs from 'eslint-plugin-sonarjs';
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
  sonarjs.configs.recommended,

  // TypeScript parser options — point at each package's tsconfig
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'unicorn/no-useless-undefined': ['error', { checkArguments: false }],
      // Duplicates typescript-eslint's no-unused-vars which we already enforce
      'sonarjs/no-unused-vars': 'off',
      // Duplicates typescript-eslint's no-unused-vars for imports
      'sonarjs/unused-import': 'off',
      // Duplicates typescript-eslint's no-unused-vars for assignments
      'sonarjs/no-dead-store': 'off',
      // False positives on /tmp usage in tests and CLI — we don't write to user-controlled paths
      'sonarjs/publicly-writable-directories': 'off',
      // False positives on child_process.spawn with explicit command paths (e.g., claude-code adapter)
      'sonarjs/no-os-command-from-path': 'off',
      // Math.random is fine for non-security purposes like UUID generation via crypto elsewhere
      'sonarjs/pseudo-random': 'off',
      // Intentional shell-out in the orchestrator's agent adapters and CLI
      'sonarjs/os-command': 'off',
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
      'sonarjs/no-nested-functions': ['error', { threshold: 5 }],
    },
  },

  // Disable prettier-conflicting rules (must be last)
  eslintConfigPrettier,
);
