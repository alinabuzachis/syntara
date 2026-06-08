import { RuleTester } from 'eslint'
import { describe, it } from 'vitest'
import rule from '../rules/use-design-tokens-not-hardcoded.js'

RuleTester.describe = describe
RuleTester.it = it

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
})

ruleTester.run('use-design-tokens-not-hardcoded', rule, {
  valid: [
    // PF design token for spacing
    {
      code: `const App = () => <div style={{ padding: 'var(--pf-t--global--spacer--md)' }} />;`,
    },
    // Zero values are allowed
    {
      code: `const App = () => <div style={{ margin: 0 }} />;`,
    },
    // String zero is allowed
    {
      code: `const App = () => <div style={{ padding: '0' }} />;`,
    },
    // Layout properties (width, height, etc.) are skipped
    {
      code: `const App = () => <div style={{ width: '200px', height: '100px', maxWidth: '500px' }} />;`,
    },
    // minWidth, minHeight, flex are layout properties
    {
      code: `const App = () => <div style={{ minWidth: '50px', minHeight: '30px', flex: '1 0 100px' }} />;`,
    },
    // Relative units are allowed for spacing
    {
      code: `const App = () => <div style={{ padding: '2em', margin: '5vh' }} />;`,
    },
    // Percentage units are allowed
    {
      code: `const App = () => <div style={{ gap: '50%' }} />;`,
    },
    // PF design token for color
    {
      code: `const App = () => <div style={{ color: 'var(--pf-t--global--color--brand--default)' }} />;`,
    },
    // Non-style attributes are not checked
    {
      code: `const App = () => <div className="my-class" />;`,
    },
    // Spread in style object is skipped
    {
      code: `const App = () => <div style={{ ...otherStyles, padding: 'var(--pf-t--global--spacer--sm)' }} />;`,
    },
    // Negative offset values are layout positioning
    {
      code: `const App = () => <div style={{ bottom: '-20px', right: '-20px' }} />;`,
    },
  ],
  invalid: [
    // Hardcoded px for padding
    {
      code: `const App = () => <div style={{ padding: '16px' }} />;`,
      errors: [{ messageId: 'hardcodedSpacing', data: { value: '16px', property: 'padding' } }],
    },
    // Hardcoded px for margin
    {
      code: `const App = () => <div style={{ marginTop: '24px' }} />;`,
      errors: [{ messageId: 'hardcodedSpacing', data: { value: '24px', property: 'marginTop' } }],
    },
    // Numeric value for gap (React treats numbers as px)
    {
      code: `const App = () => <div style={{ gap: 8 }} />;`,
      errors: [{ messageId: 'hardcodedSpacing', data: { value: '8px', property: 'gap' } }],
    },
    // Hex color value
    {
      code: `const App = () => <div style={{ color: '#ff0000' }} />;`,
      errors: [{ messageId: 'hardcodedColor', data: { value: '#ff0000', property: 'color' } }],
    },
    // RGB color value
    {
      code: `const App = () => <div style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }} />;`,
      errors: [{ messageId: 'hardcodedColor', data: { value: 'rgba(0, 0, 0, 0.5)', property: 'backgroundColor' } }],
    },
    // Short hex color
    {
      code: `const App = () => <div style={{ borderColor: '#fff' }} />;`,
      errors: [{ messageId: 'hardcodedColor', data: { value: '#fff', property: 'borderColor' } }],
    },
    // Hardcoded borderRadius
    {
      code: `const App = () => <div style={{ borderRadius: '4px' }} />;`,
      errors: [{ messageId: 'hardcodedSpacing', data: { value: '4px', property: 'borderRadius' } }],
    },
    // Multiple violations in one style object
    {
      code: `const App = () => <div style={{ padding: '8px', color: '#333' }} />;`,
      errors: [
        { messageId: 'hardcodedSpacing', data: { value: '8px', property: 'padding' } },
        { messageId: 'hardcodedColor', data: { value: '#333', property: 'color' } },
      ],
    },
    // Compound shorthand value with multiple px values
    {
      code: `const App = () => <div style={{ padding: '8px 16px' }} />;`,
      errors: [{ messageId: 'hardcodedSpacing', data: { value: '8px 16px', property: 'padding' } }],
    },
    // Compound shorthand with three values
    {
      code: `const App = () => <div style={{ margin: '8px 0 16px' }} />;`,
      errors: [{ messageId: 'hardcodedSpacing', data: { value: '8px 0 16px', property: 'margin' } }],
    },
    // Rem in compound shorthand
    {
      code: `const App = () => <div style={{ padding: '1rem 2rem' }} />;`,
      errors: [{ messageId: 'hardcodedSpacing', data: { value: '1rem 2rem', property: 'padding' } }],
    },
  ],
})
