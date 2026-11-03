import jsxA11y from 'eslint-plugin-jsx-a11y-x';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

/**
 * ESLint rules for React code: hooks rules, accessibility (WCAG) checks and Vite fast-refresh safety.
 *
 * @param {string[]} files Globs of the React workspace.
 * @returns {import('eslint').Linter.Config[]}
 */
export default function reactConfig(files) {
  return [
    {
      files,
      languageOptions: {
        globals: { ...globals.browser },
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      // The plugins' bundled types lag behind ESLint 10's; they are valid at runtime.
      plugins: /** @type {Record<string, import('eslint').ESLint.Plugin>} */ (
        /** @type {unknown} */ ({
          'react-hooks': reactHooks,
          'react-refresh': reactRefresh,
          'jsx-a11y-x': jsxA11y,
        })
      ),
      rules: {
        ...reactHooks.configs.recommended.rules,
        ...jsxA11y.configs.recommended.rules,
        'react-refresh/only-export-components': ['error', { allowConstantExport: true }],
        // JSX components are documented with JSDoc @param for their props instead of PropTypes.
        'jsdoc/require-jsdoc': [
          'error',
          { publicOnly: true, require: { FunctionDeclaration: true } },
        ],
      },
    },
  ];
}
