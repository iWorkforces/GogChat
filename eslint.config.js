import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';

export default [
  // Global ignores
  {
    ignores: [
      'lib/',
      'dist/',
      'coverage/',
      'node_modules/',
      '.github/',
      'debian/',
      'mac/',
      'windows/',
      '*.log',
      '*.tmp',
      'package-lock.json',
      '.vscode/',
      '.idea/',
      '*.js', // Ignore JS files in root and elsewhere except scripts/
    ],
  },

  // Base ESLint recommended config
  eslint.configs.recommended,

  // TypeScript files configuration (non-test files)
  {
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.test.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
        NodeJS: 'readonly',
        Electron: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        setImmediate: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        clearImmediate: 'readonly',
        fetch: 'readonly',
        performance: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      prettier: prettierPlugin,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...tseslint.configs['recommended-requiring-type-checking'].rules,
      ...prettierConfig.rules,
      'prettier/prettier': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'no-console': 'off',
      // Dry-run measurement (Plan Task 2): flag bare TS `as` casts.
      // Migrating to `asType<T>()` from src/shared/typeUtils.ts in Task 8 (will become 'error').
      // Allowlist: `as const` / `as const satisfies` (excluded by typeName.name='const'),
      // and `e as Error` inside CatchClause. typeUtils.ts and types/branded.ts are exempted via overrides below.
      'no-restricted-syntax': [
        'warn',
        {
          selector:
            'TSAsExpression:not([typeAnnotation.type="TSTypeReference"][typeAnnotation.typeName.name="const"]):not(CatchClause TSAsExpression[typeAnnotation.type="TSTypeReference"][typeAnnotation.typeName.name="Error"])',
          message:
            'Use `asType<T>(value)` from `src/shared/typeUtils.ts` (or a branded helper) instead of bare `value as T`. Bare casts reduce discoverability and are forbidden outside the allowlist.',
        },
      ],
    },
  },

  // Feature isolation: features must not import other features directly.
  // Only `menuActionRegistry` is allowed for cross-feature communication.
  // Test files are exempt (they may import features under test directly).
  {
    files: ['src/main/features/**/*.ts'],
    ignores: [
      'src/main/features/**/*.test.ts',
      'src/main/features/menuActionRegistry.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['./*', '../features/*', '!./menuActionRegistry', '!./menuActionRegistry.js'],
              message:
                'Features must not import other features directly. Use menuActionRegistry for cross-feature communication, or import from utils/ or shared/.',
            },
          ],
        },
      ],
    },
  },

  // TypeScript test files configuration (without project requirement)
  {
    files: ['src/**/*.test.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
        NodeJS: 'readonly',
        Electron: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        setImmediate: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        clearImmediate: 'readonly',
        fetch: 'readonly',
        performance: 'readonly',
        // Browser globals for preload test files
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        MutationObserver: 'readonly',
        // DOM types used in preload/offline test type annotations
        Event: 'readonly',
        EventListener: 'readonly',
        EventListenerOrEventListenerObject: 'readonly',
        MutationRecord: 'readonly',
        MutationCallback: 'readonly',
        NodeListOf: 'readonly',
        Element: 'readonly',
        HTMLLinkElement: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLElement: 'readonly',
        DOMException: 'readonly',
        Notification: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      prettier: prettierPlugin,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...prettierConfig.rules,
      'prettier/prettier': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'no-console': 'off',
    },
  },

  // Preload scripts configuration (browser environment)
  {
    files: ['src/preload/**/*.ts'],
    ignores: ['src/preload/**/*.test.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
        NodeJS: 'readonly',
        Electron: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        setImmediate: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        clearImmediate: 'readonly',
        fetch: 'readonly',
        performance: 'readonly',
        // Browser globals for preload scripts
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        MutationObserver: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      prettier: prettierPlugin,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...tseslint.configs['recommended-requiring-type-checking'].rules,
      ...prettierConfig.rules,
      'prettier/prettier': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'no-console': 'off',
    },
  },

  // Offline scripts configuration (browser environment)
  {
    files: ['src/offline/**/*.ts'],
    ignores: ['src/offline/**/*.test.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json',
      },
      globals: {
        console: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        window: 'readonly',
        document: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      prettier: prettierPlugin,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...tseslint.configs['recommended-requiring-type-checking'].rules,
      ...prettierConfig.rules,
      'prettier/prettier': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'no-console': 'off',
    },
  },

  // JavaScript files configuration (scripts/)
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        URL: 'readonly',
      },
    },
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      ...prettierConfig.rules,
      'prettier/prettier': 'error',
      'no-console': 'off',
    },
  },

  // Allowlist override for the bare-cast measurement rule.
  // typeUtils.ts owns the future asType<T>() helper; branded.ts intentionally creates branded values via internal `as`.
  // Test files (*.test.ts) are exempt as well — see Plan Task 2.
  {
    files: ['src/shared/typeUtils.ts', 'src/shared/types/branded.ts', 'src/**/*.test.ts', 'src/main/utils/config/configCache.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },

  // Forbid raw `shell.openExternal` in src/main — must route through `openExternal()`
  // wrapper at src/main/utils/security/shellWrapper.ts to enforce the ValidatedURL brand.
  {
    files: ['src/main/**/*.ts'],
    ignores: ['src/main/utils/security/shellWrapper.ts', 'src/main/**/*.test.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'shell',
          property: 'openExternal',
          message:
            "Do not call shell.openExternal directly. Import { openExternal } from 'src/main/utils/security/shellWrapper.js' — it enforces the ValidatedURL brand.",
        },
      ],
    },
  },

  // Scripts configuration (Node.js environment for build tools)
  {
    files: ['scripts/**/*.{cjs,mjs,js}'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
    },
  },

];
