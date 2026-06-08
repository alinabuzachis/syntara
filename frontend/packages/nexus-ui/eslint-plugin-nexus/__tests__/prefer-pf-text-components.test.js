import { RuleTester } from 'eslint'
import { describe, it } from 'vitest'
import rule from '../rules/prefer-pf-text-components.js'

RuleTester.describe = describe
RuleTester.it = it

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
})

ruleTester.run('prefer-pf-text-components', rule, {
  valid: [
    // PF Content component is fine
    {
      code: `const App = () => <Content component="p">Hello</Content>;`,
    },
    // div without style prop and with text is allowed (layout div)
    {
      code: `const App = () => <div>Some text</div>;`,
    },
    // div without text children is fine
    {
      code: `const App = () => <div><SomeComponent /></div>;`,
    },
    // span wrapping only JSX elements (icon wrapper pattern)
    {
      code: `const App = () => <span><Icon /></span>;`,
    },
    // span with multiple JSX children only (no text)
    {
      code: `const App = () => <span><Icon /><Badge /></span>;`,
    },
    // Inside Th without style prop is fine
    {
      code: `const App = () => <Th><span>Header</span></Th>;`,
    },
    // Inside Td without style prop is fine
    {
      code: `const App = () => <Td><span>Cell value</span></Td>;`,
    },
    // p tag with no text children (empty)
    {
      code: `const App = () => <p><SomeComponent /></p>;`,
    },
    // Non-text elements are fine
    {
      code: `const App = () => <button>Click me</button>;`,
    },
    // h1 with no text children (only JSX)
    {
      code: `const App = () => <h1><SomeComponent /></h1>;`,
    },
    // Whitespace-only JSXText in span (not text-bearing)
    {
      code: `const App = () => <span>   </span>;`,
    },
  ],
  invalid: [
    // <p> with text content should always be flagged
    {
      code: `const App = () => <p>Hello world</p>;`,
      errors: [{ messageId: 'preferPfTextComponent', data: { element: 'p' } }],
    },
    // <span> with text content
    {
      code: `const App = () => <span>Hello world</span>;`,
      errors: [{ messageId: 'preferPfTextComponent', data: { element: 'span' } }],
    },
    // <div> with style prop and text content
    {
      code: `const App = () => <div style={{ color: 'red' }}>Styled text</div>;`,
      errors: [{ messageId: 'preferPfTextComponent', data: { element: 'div' } }],
    },
    // <span> with mixed text and JSX children
    {
      code: `const App = () => <span><Icon />Some text</span>;`,
      errors: [{ messageId: 'preferPfTextComponent', data: { element: 'span' } }],
    },
    // <p> with template literal expression
    {
      code: `const App = () => <p>{\`Hello \${name}\`}</p>;`,
      errors: [{ messageId: 'preferPfTextComponent', data: { element: 'p' } }],
    },
    // <span> with string literal expression
    {
      code: `const App = () => <span>{"Some text"}</span>;`,
      errors: [{ messageId: 'preferPfTextComponent', data: { element: 'span' } }],
    },
    // <span> inside Td but WITH style prop should still flag
    {
      code: `const App = () => <Td><span style={{ fontWeight: 'bold' }}>Cell</span></Td>;`,
      errors: [{ messageId: 'preferPfTextComponent', data: { element: 'span' } }],
    },
    // <h1> with text content — use PF Title
    {
      code: `const App = () => <h1>Page Title</h1>;`,
      errors: [{ messageId: 'preferPfTextComponent', data: { element: 'h1' } }],
    },
    // <h2> with text content — use PF Title or Content
    {
      code: `const App = () => <h2>Section Title</h2>;`,
      errors: [{ messageId: 'preferPfTextComponent', data: { element: 'h2' } }],
    },
    // <h3> with template literal
    {
      code: 'const App = () => <h3>{`Heading ${level}`}</h3>;',
      errors: [{ messageId: 'preferPfTextComponent', data: { element: 'h3' } }],
    },
  ],
})
