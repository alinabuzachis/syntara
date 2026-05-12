import { RuleTester } from 'eslint'
import { describe, it } from 'vitest'

RuleTester.describe = describe
RuleTester.it = it

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
})

const noRestrictedSyntax = (await import('eslint/use-at-your-own-risk')).builtinRules.get('no-restricted-syntax')

describe('no-restricted-syntax: isReversed on Switch', () => {
  ruleTester.run('no-restricted-syntax (isReversed)', noRestrictedSyntax, {
    valid: [
      {
        code: `const App = () => <Switch label="Enable" />;`,
        options: [
          {
            selector: 'JSXOpeningElement[name.name="Switch"] JSXAttribute[name.name="isReversed"]',
            message: 'Do not use isReversed on PatternFly <Switch>.',
          },
        ],
      },
      {
        code: `const App = () => <Toggle isReversed />;`,
        options: [
          {
            selector: 'JSXOpeningElement[name.name="Switch"] JSXAttribute[name.name="isReversed"]',
            message: 'Do not use isReversed on PatternFly <Switch>.',
          },
        ],
      },
    ],
    invalid: [
      {
        code: `const App = () => <Switch isReversed label="Enable" />;`,
        options: [
          {
            selector: 'JSXOpeningElement[name.name="Switch"] JSXAttribute[name.name="isReversed"]',
            message: 'Do not use isReversed on PatternFly <Switch>.',
          },
        ],
        errors: [{ message: 'Do not use isReversed on PatternFly <Switch>.' }],
      },
      {
        code: `const App = () => <Switch isReversed={true} onChange={fn} />;`,
        options: [
          {
            selector: 'JSXOpeningElement[name.name="Switch"] JSXAttribute[name.name="isReversed"]',
            message: 'Do not use isReversed on PatternFly <Switch>.',
          },
        ],
        errors: [{ message: 'Do not use isReversed on PatternFly <Switch>.' }],
      },
    ],
  })
})

describe('no-restricted-syntax: useQueryState plain string', () => {
  const queryStateSelector =
    'CallExpression[callee.name="useQueryState"][arguments.1.type="Literal"], CallExpression[callee.name="useQueryState"][arguments.1.type="TemplateLiteral"]'
  const queryStateMessage =
    'Pass an object { title, onRetry } to useQueryState instead of a plain string. The object form enables retry buttons in error states.'

  ruleTester.run('no-restricted-syntax (useQueryState)', noRestrictedSyntax, {
    valid: [
      {
        code: `useQueryState(query, { title: 'Loading workflows', onRetry: () => refetch() });`,
        options: [{ selector: queryStateSelector, message: queryStateMessage }],
      },
      {
        code: `useQueryState(query, { title: 'Loading' });`,
        options: [{ selector: queryStateSelector, message: queryStateMessage }],
      },
      {
        code: `useQueryState(query);`,
        options: [{ selector: queryStateSelector, message: queryStateMessage }],
      },
      {
        code: `const opts = { title: 'x' }; useQueryState(query, opts);`,
        options: [{ selector: queryStateSelector, message: queryStateMessage }],
      },
      {
        code: `useSomeOtherHook(query, 'Loading workflows');`,
        options: [{ selector: queryStateSelector, message: queryStateMessage }],
      },
    ],
    invalid: [
      {
        code: `useQueryState(query, 'Loading workflows');`,
        options: [{ selector: queryStateSelector, message: queryStateMessage }],
        errors: [{ message: queryStateMessage }],
      },
      {
        code: 'useQueryState(query, `Loading ${entity}`);',
        options: [{ selector: queryStateSelector, message: queryStateMessage }],
        errors: [{ message: queryStateMessage }],
      },
      {
        code: `useQueryState(query, '');`,
        options: [{ selector: queryStateSelector, message: queryStateMessage }],
        errors: [{ message: queryStateMessage }],
      },
    ],
  })
})

describe('no-restricted-syntax: showSuccess/showError positional string', () => {
  const alertSelector =
    'CallExpression[callee.name="showSuccess"][arguments.0.type="Literal"], CallExpression[callee.name="showError"][arguments.0.type="Literal"]'
  const alertMessage =
    'Pass an object { title, description? } to showSuccess/showError/showWarning/showInfo() instead of a positional string argument.'

  ruleTester.run('no-restricted-syntax (alert object param)', noRestrictedSyntax, {
    valid: [
      {
        code: `showSuccess({ title: "Done" });`,
        options: [{ selector: alertSelector, message: alertMessage }],
      },
      {
        code: `showError({ title: "Failed", description: "Details" });`,
        options: [{ selector: alertSelector, message: alertMessage }],
      },
    ],
    invalid: [
      {
        code: `showSuccess("Done");`,
        options: [{ selector: alertSelector, message: alertMessage }],
        errors: [{ message: alertMessage }],
      },
      {
        code: `showError("Failed");`,
        options: [{ selector: alertSelector, message: alertMessage }],
        errors: [{ message: alertMessage }],
      },
    ],
  })
})
