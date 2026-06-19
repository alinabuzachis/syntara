import { RuleTester } from 'eslint'
import { describe, it } from 'vitest'
import rule from '../rules/no-locale-date-format.js'

RuleTester.describe = describe
RuleTester.it = it

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
})

ruleTester.run('no-locale-date-format', rule, {
  valid: [
    {
      code: `
        import { formatDateTime } from '../../utils/dateUtils';
        const d = formatDateTime(isoString);
      `,
    },
    {
      code: `
        import { DateCell } from '../../components/table/DateCell';
        const App = () => <DateCell dateString={iso} />;
      `,
    },
    {
      code: `
        import { Content } from '@patternfly/react-core';
        const App = () => <Content>Hello</Content>;
      `,
    },
    {
      code: `const n = someNumber.toLocaleString();`,
    },
    {
      code: `const s = someVar.toLocaleString();`,
    },
  ],
  invalid: [
    {
      code: `const d = new Date(iso).toLocaleString();`,
      errors: [{ messageId: 'noLocaleDate' }],
    },
    {
      code: `const d = new Date().toLocaleString();`,
      errors: [{ messageId: 'noLocaleDate' }],
    },
    {
      code: `const d = date.toLocaleDateString();`,
      errors: [{ messageId: 'noLocaleDate' }],
    },
    {
      code: `const t = date.toLocaleTimeString('en-US', {});`,
      errors: [{ messageId: 'noLocaleDate' }],
    },
    {
      code: `
        import { Timestamp } from '@patternfly/react-core';
        const App = () => <Timestamp date={d} />;
      `,
      errors: [{ messageId: 'noTimestamp' }],
    },
    {
      code: `
        import { Content, Timestamp } from '@patternfly/react-core';
        const App = () => <Timestamp date={d} />;
      `,
      errors: [{ messageId: 'noTimestamp' }],
    },
  ],
})
