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
    // div with variable child but no style prop (layout div)
    {
      code: `const App = () => <div>{children}</div>;`,
    },
    // span with variable child only (no style) — PF6 has no ContentVariants.span
    {
      code: `const App = ({ text }) => <span>{text}</span>;`,
    },
    // span with className and variable (structural styling, not styled text)
    {
      code: `const App = ({ text }) => <span className={styles.label}>{text}</span>;`,
    },
    // span with function call but no style (structural)
    {
      code: `const App = () => <span>{formatValue(x)}</span>;`,
    },
    // span with member expression but no style
    {
      code: `const App = () => <span>{item.label}</span>;`,
    },
    // span with conditional but no style
    {
      code: `const App = ({ a }) => <span>{a ? 'yes' : 'no'}</span>;`,
    },
    // span with logical expression but no style
    {
      code: `const App = ({ a }) => <span>{a && label}</span>;`,
    },
  ],
  invalid: [
    // <p> with text content should always be flagged
    {
      code: `const App = () => <p>Hello world</p>;`,
      errors: [{ messageId: 'preferPfTextComponent', data: { element: 'p' } }],
    },
    // <span> with literal text content
    {
      code: `const App = () => <span>Hello world</span>;`,
      errors: [{ messageId: 'preferPfTextComponent', data: { element: 'span' } }],
    },
    // <div> with style prop and literal text content
    {
      code: `const App = () => <div style={{ color: 'red' }}>Styled text</div>;`,
      errors: [{ messageId: 'preferPfTextComponent', data: { element: 'div' } }],
    },
    // <span> with mixed literal text and JSX children
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
    // <span> with style prop and variable — styled text wrapper (the PR #667 blind spot)
    {
      code: `const App = ({ desc }) => <span style={myStyle}>{desc}</span>;`,
      errors: [{ messageId: 'preferPfTextComponent', data: { element: 'span' } }],
    },
    // <p> with variable expression — always flagged (PF Content exists)
    {
      code: `const App = ({ msg }) => <p>{msg}</p>;`,
      errors: [{ messageId: 'preferPfTextComponent', data: { element: 'p' } }],
    },
    // <div> with style prop and variable expression — styled text
    {
      code: `const App = ({ text }) => <div style={{ color: 'red' }}>{text}</div>;`,
      errors: [{ messageId: 'preferPfTextComponent', data: { element: 'div' } }],
    },
    // <h1> with variable expression — always flagged (PF Title exists)
    {
      code: `const App = ({ title }) => <h1>{title}</h1>;`,
      errors: [{ messageId: 'preferPfTextComponent', data: { element: 'h1' } }],
    },
    // <span> with style prop and member expression — styled text
    {
      code: `const App = () => <span style={{ fontSize: '12px' }}>{item.label}</span>;`,
      errors: [{ messageId: 'preferPfTextComponent', data: { element: 'span' } }],
    },
    // <div> with style prop and function call — styled text
    {
      code: `const App = () => <div style={{ fontStyle: 'italic' }}>{formatName(user)}</div>;`,
      errors: [{ messageId: 'preferPfTextComponent', data: { element: 'div' } }],
    },
  ],
})
