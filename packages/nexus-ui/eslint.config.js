import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import importPlugin from 'eslint-plugin-import-x'
import noOnlyTests from 'eslint-plugin-no-only-tests'
import testingLibrary from 'eslint-plugin-testing-library'
import sonarjs from 'eslint-plugin-sonarjs'
import unicorn from 'eslint-plugin-unicorn'
import vitest from '@vitest/eslint-plugin'
import pluginQuery from '@tanstack/eslint-plugin-query'
import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default tseslint.config(
  { ignores: ['dist', 'coverage/**', 'playwright.config.ts', 'test-results/**', 'playwright-report/**', 'scripts/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...pluginQuery.configs['flat/recommended'],
  // Align with Sonar typescript:S2245 / CWE-338: Math.random is not suitable for secrets, tokens, or crypto.
  // Use globalThis.crypto.getRandomValues(), crypto.randomUUID(), node:crypto.randomInt/randomBytes, or the uuid package.
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'CallExpression[callee.type="MemberExpression"][callee.object.name="Math"][callee.property.name="random"]',
          message:
            'Do not use Math.random() — it is not cryptographically secure. Use crypto.getRandomValues(), crypto.randomUUID(), node:crypto.randomInt/randomBytes, or the uuid package. If the value is strictly non-security (e.g. visual jitter), add an eslint-disable-next-line with a short justification.',
        },
      ],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        project: ['./tsconfig.app.json', './tsconfig.node.json', './tsconfig.e2e.json'],
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
      'import-x': importPlugin,
      'no-only-tests': noOnlyTests,
      sonarjs,
      unicorn,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/exhaustive-deps': 'error',
      // Strict accessibility linting for JSX (labels, roles, alt text, etc.)
      ...jsxA11y.configs.strict.rules,
      'react-refresh/only-export-components': ['error', { allowConstantExport: true }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      // Disallow the `void` operator (Sonar S3735 / readability). For deliberately unawaited work from
      // sync callbacks, use `detachPromise(...)` (optionally `{ onReject }`); otherwise `await` or return
      // the promise so the caller handles errors. Do not confuse with TypeScript `: void` return types.
      'no-void': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-private-class-members': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      'no-console': 'error',
      'no-restricted-exports': ['error', { restrictDefaultExports: { direct: true } }],
      'no-only-tests/no-only-tests': 'error',
      'react/no-array-index-key': 'error',
      // Avoid new object/array identities as Context.Provider value (needless consumer rerenders; Sonar).
      'react/jsx-no-constructed-context-values': 'error',
      'react/jsx-no-useless-fragment': ['error', { allowExpressions: true }],
      'react/self-closing-comp': 'error',
      'unicorn/prefer-number-properties': 'error',
      'unicorn/consistent-template-literal-escape': 'error',
      'unicorn/no-useless-iterator-to-array': 'error',
      'unicorn/prefer-simple-condition-first': 'error',
      'unicorn/switch-case-break-position': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': ['error', { ignorePrimitives: { string: true, boolean: true } }],
      '@typescript-eslint/require-array-sort-compare': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/prefer-includes': 'error',
      // Type-checked rules from recommendedTypeChecked preset (adopted from AAP UI)
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/unbound-method': 'error',
      '@typescript-eslint/no-base-to-string': 'error',
      '@typescript-eslint/restrict-template-expressions': 'error',
      '@typescript-eslint/only-throw-error': 'error',
      // Readability rules — thresholds based on industry standards (Code Complete, SonarQube, BiomeJS)
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 200, skipBlankLines: true, skipComments: true, IIFEs: true }],
      complexity: ['error', 20],
      // Aligns with Sonar typescript:S3776 (cognitive complexity). Prefer extraction over suppressions.
      'sonarjs/cognitive-complexity': ['error', 15],
      // Aligns with Sonar typescript:S3358 (nested ternary). Matches SonarCloud carve-outs (e.g. separate JSX `{}` blocks).
      'sonarjs/no-nested-conditional': 'error',
      'max-depth': ['error', 4],
      'max-params': ['error', 5],
      // Limit nested functions/callbacks (e.g. hooks → timeout → setState updater). Complements max-depth
      // and aligns with Sonar-style “deeply nested functions” maintainability rules. Tests disable this.
      'max-nested-callbacks': ['error', 4],
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import-x/no-duplicates': 'error',
      'import-x/no-cycle': ['error', { maxDepth: 2 }],
      'import-x/no-self-import': 'error',
    },
  },
  {
    files: ['**/index.tsx', '**/main.tsx', '**/vite.config.ts', '**/vitest.config.ts', '**/vitest.browser.config.ts'],
    rules: {
      'no-console': 'off',
      'no-restricted-exports': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'max-nested-callbacks': 'off',
      complexity: 'off',
      'sonarjs/cognitive-complexity': 'off',
    },
  },
  {
    ...testingLibrary.configs['flat/react'],
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    ignores: ['e2e/**'],
    rules: {
      ...testingLibrary.configs['flat/react'].rules,
      'testing-library/no-debugging-utils': 'error',
      // Many existing tests use container queries / DOM traversal; warn until migrated
      'testing-library/no-container': 'warn',
      'testing-library/no-node-access': 'warn',
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    ignores: ['e2e/**'],
    plugins: { vitest },
    rules: {
      // Aligns with Sonar S2699: every test must contain an explicit assertion call.
      // Custom URL helpers count as assertions when invoked in the test body.
      'vitest/expect-expect': [
        'error',
        {
          // expect* matches local helpers like expectStroke in edge/path tests
          assertFunctionNames: [
            'expect',
            'expect*',
            'assertUrlParam',
            'assertUrlParamIsNull',
            'assertSearchParamsWasCalled',
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/registry/nodes/register*.ts',
      '**/app/App.tsx',
      '**/routes/**/Automations.tsx',
      '**/routes/**/BuilderNew.tsx',
      '**/routes/**/BuilderEdit.tsx',
      '**/routes/**/Executions.tsx',
      '**/routes/**/ExecutionDetail.tsx',
      '**/routes/**/Integrations.tsx',
      '**/routes/**/IntegrationTools.tsx',
      '**/routes/**/Glossary.tsx',
      '**/routes/**/Settings.tsx',
      '**/routes/**/Approvals.tsx',
      '**/routes/**/ApprovalDetail.tsx',
      '**/routes/**/Authentication.tsx',
      '**/routes/**/Credentials.tsx',
      '**/routes/**/CredentialDetail.tsx',
      '**/routes/**/CredentialTypes.tsx',
      '**/routes/**/CredentialTypeDetail.tsx',
      '**/vite-env.d.ts',
    ],
    rules: {
      'no-restricted-exports': 'off',
    },
  },
  {
    files: ['e2e/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  eslintConfigPrettier
)
