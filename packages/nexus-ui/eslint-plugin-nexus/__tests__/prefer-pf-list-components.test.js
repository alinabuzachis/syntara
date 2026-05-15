import { RuleTester } from 'eslint'
import { describe, it } from 'vitest'
import rule from '../rules/prefer-pf-list-components.js'

RuleTester.describe = describe
RuleTester.it = it

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
})

ruleTester.run('prefer-pf-list-components', rule, {
  valid: [
    {
      code: `const App = () => (
        <List>
          <ListItem>One</ListItem>
        </List>
      );`,
    },
    {
      code: `const App = () => <div>Not a list</div>;`,
    },
    {
      code: `const App = () => <button type="button">Action</button>;`,
    },
    // Namespaced / member component names are not native tags
    {
      code: `const App = () => <motion.li>Item</motion.li>;`,
    },
  ],
  invalid: [
    {
      code: `const App = () => (
        <ul>
          <li>Item</li>
        </ul>
      );`,
      errors: [
        { messageId: 'preferPfListComponent', data: { element: 'ul' } },
        { messageId: 'preferPfListComponent', data: { element: 'li' } },
      ],
    },
    {
      code: `const App = () => <ol><li>First</li></ol>;`,
      errors: [
        { messageId: 'preferPfListComponent', data: { element: 'ol' } },
        { messageId: 'preferPfListComponent', data: { element: 'li' } },
      ],
    },
    {
      code: `const App = () => <li>Orphan</li>;`,
      errors: [{ messageId: 'preferPfListComponent', data: { element: 'li' } }],
    },
  ],
})
