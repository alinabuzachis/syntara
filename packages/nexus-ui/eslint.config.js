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
import reactUseEffect from 'eslint-plugin-react-you-might-not-need-an-effect'
import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'
import nexusPlugin from './eslint-plugin-nexus/index.js'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage/**',
      'playwright.config.ts',
      'test-results/**',
      'playwright-report/**',
      'scripts/**',
      'eslint-plugin-nexus/**',
    ],
  },
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
        {
          selector: 'JSXOpeningElement[name.name="Switch"] JSXAttribute[name.name="isReversed"]',
          message:
            'Do not use isReversed on PatternFly <Switch>. The default layout (toggle left, label right) is the UX standard.',
        },
        {
          selector:
            'CallExpression[callee.name="showSuccess"][arguments.0.type="Literal"], CallExpression[callee.name="showSuccess"][arguments.0.type="TemplateLiteral"], CallExpression[callee.name="showError"][arguments.0.type="Literal"], CallExpression[callee.name="showError"][arguments.0.type="TemplateLiteral"], CallExpression[callee.name="showWarning"][arguments.0.type="Literal"], CallExpression[callee.name="showWarning"][arguments.0.type="TemplateLiteral"], CallExpression[callee.name="showInfo"][arguments.0.type="Literal"], CallExpression[callee.name="showInfo"][arguments.0.type="TemplateLiteral"]',
          message:
            'Pass an object { title, description? } to showSuccess/showError/showWarning/showInfo() instead of a positional string argument.',
        },
        {
          selector:
            'CallExpression[callee.name="useQueryState"][arguments.1.type="Literal"], CallExpression[callee.name="useQueryState"][arguments.1.type="TemplateLiteral"]',
          message:
            'Pass an object { title, onRetry } to useQueryState instead of a plain string. The object form enables retry buttons in error states.',
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message:
            'Use a typed API client (workflowClient, credentialsClient, etc.) instead of raw fetch(). If this is a pre-auth call, add an eslint-disable-next-line with a short justification.',
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
        project: ['./tsconfig.app.json', './tsconfig.node.json', './tsconfig.e2e.json', './tsconfig.storybook.json'],
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
      nexus: nexusPlugin,
      reactYouMightNotNeedAnEffect: reactUseEffect,
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
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      // -- nexus custom rules (PR checklist + UX design system enforcement) --
      // no-switch-is-reversed, require-alert-object-param, and require-query-state-object
      // are enforced via no-restricted-syntax AST selectors above (no custom plugin needed).
      'nexus/prefer-pf-list-components': 'error',
      'nexus/prefer-pf-text-components': 'error',
      'nexus/use-design-tokens-not-hardcoded': 'error',
      'nexus/prefer-confirmation-dialog': 'warn',
      // Catch unnecessary useEffect patterns. Aligns with https://react.dev/learn/you-might-not-need-an-effect
      'reactYouMightNotNeedAnEffect/no-derived-state': 'warn',
      'reactYouMightNotNeedAnEffect/no-chain-state-updates': 'warn',
      'reactYouMightNotNeedAnEffect/no-event-handler': 'warn',
      'reactYouMightNotNeedAnEffect/no-adjust-state-on-prop-change': 'warn',
      'reactYouMightNotNeedAnEffect/no-reset-all-state-on-prop-change': 'warn',
      'reactYouMightNotNeedAnEffect/no-pass-live-state-to-parent': 'warn',
      'reactYouMightNotNeedAnEffect/no-pass-data-to-parent': 'warn',
      'reactYouMightNotNeedAnEffect/no-initialize-state': 'warn',
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
    // Storybook CSF requires `export default meta`; Storybook config files require a default export —
    // exempt both from the default-export ban
    files: ['**/*.stories.{ts,tsx}', '**/.storybook/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-exports': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', 'e2e/visual-regression/**/*.ts'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'max-nested-callbacks': 'off',
      complexity: 'off',
      'sonarjs/cognitive-complexity': 'off',
      'nexus/prefer-pf-list-components': 'off',
      'nexus/prefer-pf-text-components': 'off',
      'nexus/use-design-tokens-not-hardcoded': 'off',
      'nexus/prefer-confirmation-dialog': 'off',
      'reactYouMightNotNeedAnEffect/no-derived-state': 'off',
      'reactYouMightNotNeedAnEffect/no-chain-state-updates': 'off',
      'reactYouMightNotNeedAnEffect/no-event-handler': 'off',
      'reactYouMightNotNeedAnEffect/no-adjust-state-on-prop-change': 'off',
      'reactYouMightNotNeedAnEffect/no-reset-all-state-on-prop-change': 'off',
      'reactYouMightNotNeedAnEffect/no-pass-live-state-to-parent': 'off',
      'reactYouMightNotNeedAnEffect/no-pass-data-to-parent': 'off',
      'reactYouMightNotNeedAnEffect/no-initialize-state': 'off',
    },
  },
  {
    ...testingLibrary.configs['flat/react'],
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    ignores: ['e2e/**'],
    rules: {
      ...testingLibrary.configs['flat/react'].rules,
      'testing-library/no-debugging-utils': 'error',
      // Prefer userEvent over fireEvent for realistic user interaction simulation
      'testing-library/prefer-user-event': 'warn',
      // Many existing tests use container queries / DOM traversal; warn until migrated
      'testing-library/no-container': 'warn',
      'testing-library/no-node-access': 'warn',
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    ignores: ['e2e/**'],
    rules: {
      // Prefer semantic Testing Library queries (getByRole, getByLabelText, etc.) over raw DOM lookups.
      // document.getElementById bypasses a11y semantics and is as fragile as querySelector in tests.
      'no-restricted-properties': [
        'error',
        {
          object: 'document',
          property: 'getElementById',
          message:
            'Use a Testing Library semantic query instead (e.g. screen.getByRole(...)). document.getElementById() bypasses accessibility semantics and is as fragile as container.querySelector().',
        },
      ],
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
      '**/routes/**/Workflows.tsx',
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
      '**/routes/**/AuditLog.tsx',
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
      // Testing Library rules target RTL/vitest patterns; Playwright specs use locator-based APIs
      'testing-library/prefer-screen-queries': 'off',
    },
  },
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  eslintConfigPrettier
)
