import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import perfectionist from 'eslint-plugin-perfectionist';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript strict rules
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // Svelte rules
  ...svelte.configs['flat/recommended'],
  ...svelte.configs['flat/prettier'],

  // Perfectionist for import/export sorting
  perfectionist.configs['recommended-natural'],

  // Prettier must be last to disable conflicting rules
  prettier,

  // Global configuration
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        extraFileExtensions: ['.svelte'],
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Svelte-specific configuration
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },

  // Strict rules for source files
  {
    files: ['src/**/*.ts', 'src/**/*.svelte'],
    rules: {
      // TypeScript strict rules - errors
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports', prefer: 'type-imports' },
      ],
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/explicit-module-boundary-types': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      // Relaxed rules - these are too strict for existing codebase
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/prefer-optional-chain': 'warn',
      '@typescript-eslint/restrict-plus-operands': 'warn',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/return-await': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',

      curly: ['error', 'all'],
      eqeqeq: ['error', 'always'],
      // General strict rules - allow console.log for server-side debugging
      'no-console': 'off',
      'no-duplicate-imports': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-arrow-callback': 'error',
      'prefer-const': 'error',
      'prefer-template': 'error',

      // Svelte specific rules
      'svelte/no-navigation-without-resolve': 'off',

      // Perfectionist uses recommended-natural config defaults
    },
  },

  // Relaxed rules for config files
  {
    files: ['*.config.js', '*.config.ts', 'vite.config.*', 'svelte.config.*'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },

  // Disable type-checking for config files (not in tsconfig)
  {
    files: ['*.config.js', '*.config.ts', 'vite.config.*', 'svelte.config.*'],
    ...tseslint.configs.disableTypeChecked,
  },

  // Ignore patterns (must be a standalone object)
  {
    ignores: [
      'build/',
      '.svelte-kit/',
      'dist/',
      'node_modules/',
      '.vercel/',
      '.claude/',
      'ios/',
      '*.min.js',
      'package-lock.json',
      'pnpm-lock.yaml',
      'tests/',
      'scripts/',
      'test/',
      'vite.config.js.timestamp-*',
      'src/generated/',
      'android/',
      'bin/',
      'server.ts',
      'src/lib/modules/server/terminal/pty-holder.cjs',
    ],
  }
);
