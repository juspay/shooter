import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';
import globals from 'globals';

// Shared rules for all TypeScript/JavaScript files
const baseRules = {
  'curly': ['error', 'all'],
  'brace-style': ['error', '1tbs', { allowSingleLine: false }],
  'no-unused-vars': ['error', {
    argsIgnorePattern: '^_',
    varsIgnorePattern: '^_',
    caughtErrorsIgnorePattern: '^_'
  }]
};

export default [
  // Ignore build output directories
  {
    ignores: ['.svelte-kit/**', '.vercel/**', 'node_modules/**']
  },

  // Base JavaScript config
  js.configs.recommended,

  // TypeScript and JavaScript files
  {
    files: ['**/*.{ts,js}'],
    languageOptions: {
      parser: typescriptParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    plugins: {
      '@typescript-eslint': typescript
    },
    rules: {
      ...baseRules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      'no-undef': 'off' // TypeScript handles this
    }
  },

  // Svelte files
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        parser: typescriptParser
      },
      globals: {
        ...globals.browser
      }
    },
    plugins: {
      svelte
    },
    rules: {
      ...svelte.configs.recommended.rules,
      ...baseRules
    }
  },

  // Type definition files
  {
    files: ['**/*.d.ts'],
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off'
    }
  },

  // Test files - allow any for mocking
  {
    files: ['**/__tests__/**/*.{ts,js}', '**/*.test.{ts,js}', '**/*.spec.{ts,js}'],
    languageOptions: {
      globals: {
        ...globals.node,
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        vi: 'readonly'
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-unused-vars': 'off'
    }
  },

  // Scripts - allow any and console
  {
    files: ['scripts/**/*.{ts,js}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
      'no-unused-vars': 'off'
    }
  },

  // Claude hooks - CommonJS files
  {
    files: ['.claude/hooks/**/*.cjs'],
    languageOptions: {
      sourceType: 'script',
      globals: globals.node
    },
    rules: {
      'no-unused-vars': 'off'
    }
  }
];
