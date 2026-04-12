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
      '@typescript-eslint/no-explicit-any': 'error',
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

      // Complexity guards
      'max-depth': ['error', 6],
      'max-lines-per-function': ['warn', 300],
      'max-params': ['error', 6],

      // General strict rules - allow console.log for server-side debugging
      'no-console': 'off',
      'no-duplicate-imports': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      // Type governance: all types must live in src/lib/types/
      // Ban type imports from anywhere except: $lib/types, ./$types (SvelteKit),
      // svelte/*, @sveltejs/*, @juspay/* (component libraries)
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['$lib/types/generated/*'],
              message: 'Import types from $lib/types (barrel) instead of $lib/types/generated/*.',
            },
          ],
        },
      ],
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

  // Ban type/interface definitions outside src/lib/types/
  {
    files: ['src/**/*.ts', 'src/**/*.svelte'],
    ignores: ['src/lib/types/**', 'src/app.d.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          message:
            'Define types in src/lib/types/ only. Use specs/types/*.yaml for generated types or src/lib/types/<module>.ts for hand-written types.',
          selector: 'TSInterfaceDeclaration',
        },
        {
          message:
            'Define types in src/lib/types/ only. Use specs/types/*.yaml for generated types or src/lib/types/<module>.ts for hand-written types.',
          selector: 'TSTypeAliasDeclaration',
        },
      ],
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

  // server.ts is the custom Node.js entry point — it lives outside src/ and is
  // not included in tsconfig.json, so type-aware rules cannot run on it.
  // Non-type-aware rules (style, correctness) still apply.
  {
    files: ['server.ts'],
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
      'src/lib/types/generated/',
      'android/',
      'bin/',
      'src/lib/modules/server/terminal/pty-holder.cjs',
      'wasm-poc/',
      'static/',
      'test-browser.cjs',
    ],
  }
);
