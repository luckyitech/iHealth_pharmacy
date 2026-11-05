import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import jsdoc from 'eslint-plugin-jsdoc';
import globals from 'globals';

/**
 * Shared ESLint flat config for every workspace.
 * Apps extend this with their own environment-specific rules (e.g. React in apps/web).
 *
 * @type {import('eslint').Linter.Config[]}
 */
export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  js.configs.recommended,
  jsdoc.configs['flat/recommended-error'],
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      // Structured logging (pino) only; console output is not allowed in committed code.
      'no-console': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'all' }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      // JSDoc is required on exported (public) functions only; internals stay lightweight.
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: true,
          require: { FunctionDeclaration: true, ArrowFunctionExpression: true },
        },
      ],
      'jsdoc/require-param-description': 'off',
      'jsdoc/require-returns-description': 'off',
      // TypeScript infers return types. An untyped `@returns` keeps inference for builders such as Zod schemas.
      'jsdoc/require-returns-type': 'off',
      'jsdoc/require-property-description': 'off',
      'jsdoc/tag-lines': 'off',
      // tsc (checkJs) resolves JSDoc types, including globals such as NodeJS.*, more accurately than ESLint.
      'jsdoc/no-undefined-types': 'off',
    },
  },
  {
    files: ['**/*.config.{js,mjs,cjs}', '**/*.{test,spec}.{js,jsx}'],
    rules: {
      'jsdoc/require-jsdoc': 'off',
    },
  },
  prettier,
];
