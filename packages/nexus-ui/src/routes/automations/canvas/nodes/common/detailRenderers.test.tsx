import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderCondition, renderInputs, renderJson, renderObject, renderOutputs, renderText } from './detailRenderers'

describe('detailRenderers', () => {
  describe('renderCondition', () => {
    it('returns null when condition is undefined', () => {
      const view = renderCondition(undefined)
      expect(view).toBeNull()
    })

    it('returns null when condition is empty string', () => {
      const view = renderCondition('')
      expect(view).toBeNull()
    })

    it('renders condition with label', () => {
      const view = renderCondition('x > 5')
      render(<>{view}</>)

      expect(screen.getByText('Condition')).toBeInTheDocument()
      expect(screen.getByText('x > 5')).toBeInTheDocument()
    })

    it('renders multi-line condition', () => {
      const condition = 'if (x > 5) {\n  return true\n}'
      const view = renderCondition(condition)
      render(<>{view}</>)

      expect(screen.getByText(/if \(x > 5\)/)).toBeInTheDocument()
    })
  })

  describe('renderOutputs', () => {
    it('returns null when outputs is undefined', () => {
      const view = renderOutputs(undefined)
      expect(view).toBeNull()
    })

    it('renders single output', () => {
      const view = renderOutputs({ result: 'success' })
      render(<>{view}</>)

      expect(screen.getByText('Outputs')).toBeInTheDocument()
      expect(screen.getByText('result: success')).toBeInTheDocument()
    })

    it('renders multiple outputs on separate lines', () => {
      const view = renderOutputs({
        status: 'ok',
        count: 42,
      })
      render(<>{view}</>)

      expect(screen.getByText(/status: ok/)).toBeInTheDocument()
      expect(screen.getByText(/count: 42/)).toBeInTheDocument()
    })

    it('renders empty object without crashing', () => {
      const view = renderOutputs({})
      render(<>{view}</>)

      expect(screen.getByText('Outputs')).toBeInTheDocument()
    })
  })

  describe('renderInputs', () => {
    it('returns null when inputs is undefined', () => {
      const view = renderInputs(undefined)
      expect(view).toBeNull()
    })

    it('renders single input', () => {
      const view = renderInputs({ name: 'test' })
      render(<>{view}</>)

      expect(screen.getByText('Inputs')).toBeInTheDocument()
      expect(screen.getByText('name: test')).toBeInTheDocument()
    })

    it('renders multiple inputs on separate lines', () => {
      const view = renderInputs({
        name: 'test',
        value: 123,
      })
      render(<>{view}</>)

      expect(screen.getByText(/name: test/)).toBeInTheDocument()
      expect(screen.getByText(/value: 123/)).toBeInTheDocument()
    })
  })

  describe('renderJson', () => {
    it('returns null when show is false', () => {
      const view = renderJson({ key: 'value' }, false)
      expect(view).toBeNull()
    })

    it('returns null when show is undefined', () => {
      const view = renderJson({ key: 'value' }, undefined)
      expect(view).toBeNull()
    })

    it('returns null when data is undefined', () => {
      const view = renderJson(undefined, true)
      expect(view).toBeNull()
    })

    it('returns null when data is null', () => {
      const view = renderJson(null, true)
      expect(view).toBeNull()
    })

    it('renders JSON with default label', () => {
      const view = renderJson({ key: 'value' }, true)
      render(<>{view}</>)

      expect(screen.getByText('JSON')).toBeInTheDocument()
    })

    it('renders JSON with custom label', () => {
      const view = renderJson({ key: 'value' }, true, 'Custom Label')
      render(<>{view}</>)

      expect(screen.getByText('Custom Label')).toBeInTheDocument()
    })

    it('wraps non-object data in object', () => {
      const view = renderJson('string value', true)
      render(<>{view}</>)

      // Should wrap in { value: 'string value' }
      expect(screen.getByText('JSON')).toBeInTheDocument()
    })

    it('renders object data as JSON', () => {
      const view = renderJson({ name: 'test', count: 5 }, true)
      render(<>{view}</>)

      expect(screen.getByText('JSON')).toBeInTheDocument()
    })
  })

  describe('renderObject', () => {
    it('returns null when data is undefined', () => {
      const view = renderObject('Test Label', undefined)
      expect(view).toBeNull()
    })

    it('renders object with custom label', () => {
      const view = renderObject('Configuration', { setting: 'enabled' })
      render(<>{view}</>)

      expect(screen.getByText('Configuration')).toBeInTheDocument()
    })

    it('renders nested object', () => {
      const view = renderObject('Settings', {
        db: { host: 'localhost', port: 5432 },
      })
      render(<>{view}</>)

      expect(screen.getByText('Settings')).toBeInTheDocument()
    })
  })

  describe('renderText', () => {
    it('returns null when text is undefined', () => {
      const view = renderText('Label', undefined)
      expect(view).toBeNull()
    })

    it('returns null when text is null', () => {
      const view = renderText('Label', null as unknown as string)
      expect(view).toBeNull()
    })

    it('returns null when text is empty string', () => {
      const view = renderText('Label', '')
      expect(view).toBeNull()
    })

    it('renders text with label', () => {
      const view = renderText('Description', 'This is a test')
      render(<>{view}</>)

      expect(screen.getByText('Description')).toBeInTheDocument()
      expect(screen.getByText('This is a test')).toBeInTheDocument()
    })

    it('renders multi-line text', () => {
      const view = renderText('Script', 'line 1\nline 2\nline 3')
      render(<>{view}</>)

      expect(screen.getByText('Script')).toBeInTheDocument()
      expect(screen.getByText(/line 1/)).toBeInTheDocument()
    })

    it('renders text with special characters', () => {
      const view = renderText('Command', 'echo "hello world" && exit 0')
      render(<>{view}</>)

      expect(screen.getByText(/echo "hello world"/)).toBeInTheDocument()
    })
  })
})
