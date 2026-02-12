import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderCondition, renderInputs, renderJson, renderObject, renderOutputs, renderText } from './detailRenderers'

describe('detailRenderers', () => {
  describe('renderCondition', () => {
    it('returns null when condition is undefined', () => {
      const result = renderCondition(undefined)
      expect(result).toBeNull()
    })

    it('returns null when condition is empty string', () => {
      const result = renderCondition('')
      expect(result).toBeNull()
    })

    it('renders condition with label', () => {
      const result = renderCondition('x > 5')
      render(<>{result}</>)

      expect(screen.getByText('Condition')).toBeInTheDocument()
      expect(screen.getByText('x > 5')).toBeInTheDocument()
    })

    it('renders multi-line condition', () => {
      const condition = 'if (x > 5) {\n  return true\n}'
      const result = renderCondition(condition)
      render(<>{result}</>)

      expect(screen.getByText(/if \(x > 5\)/)).toBeInTheDocument()
    })
  })

  describe('renderOutputs', () => {
    it('returns null when outputs is undefined', () => {
      const result = renderOutputs(undefined)
      expect(result).toBeNull()
    })

    it('renders single output', () => {
      const result = renderOutputs({ result: 'success' })
      render(<>{result}</>)

      expect(screen.getByText('Outputs')).toBeInTheDocument()
      expect(screen.getByText('result: success')).toBeInTheDocument()
    })

    it('renders multiple outputs on separate lines', () => {
      const result = renderOutputs({
        status: 'ok',
        count: 42,
      })
      render(<>{result}</>)

      expect(screen.getByText(/status: ok/)).toBeInTheDocument()
      expect(screen.getByText(/count: 42/)).toBeInTheDocument()
    })

    it('renders empty object without crashing', () => {
      const result = renderOutputs({})
      render(<>{result}</>)

      expect(screen.getByText('Outputs')).toBeInTheDocument()
    })
  })

  describe('renderInputs', () => {
    it('returns null when inputs is undefined', () => {
      const result = renderInputs(undefined)
      expect(result).toBeNull()
    })

    it('renders single input', () => {
      const result = renderInputs({ name: 'test' })
      render(<>{result}</>)

      expect(screen.getByText('Inputs')).toBeInTheDocument()
      expect(screen.getByText('name: test')).toBeInTheDocument()
    })

    it('renders multiple inputs on separate lines', () => {
      const result = renderInputs({
        name: 'test',
        value: 123,
      })
      render(<>{result}</>)

      expect(screen.getByText(/name: test/)).toBeInTheDocument()
      expect(screen.getByText(/value: 123/)).toBeInTheDocument()
    })
  })

  describe('renderJson', () => {
    it('returns null when show is false', () => {
      const result = renderJson({ key: 'value' }, false)
      expect(result).toBeNull()
    })

    it('returns null when show is undefined', () => {
      const result = renderJson({ key: 'value' }, undefined)
      expect(result).toBeNull()
    })

    it('returns null when data is undefined', () => {
      const result = renderJson(undefined, true)
      expect(result).toBeNull()
    })

    it('returns null when data is null', () => {
      const result = renderJson(null, true)
      expect(result).toBeNull()
    })

    it('renders JSON with default label', () => {
      const result = renderJson({ key: 'value' }, true)
      render(<>{result}</>)

      expect(screen.getByText('JSON')).toBeInTheDocument()
    })

    it('renders JSON with custom label', () => {
      const result = renderJson({ key: 'value' }, true, 'Custom Label')
      render(<>{result}</>)

      expect(screen.getByText('Custom Label')).toBeInTheDocument()
    })

    it('wraps non-object data in object', () => {
      const result = renderJson('string value', true)
      render(<>{result}</>)

      // Should wrap in { value: 'string value' }
      expect(screen.getByText('JSON')).toBeInTheDocument()
    })

    it('renders object data as JSON', () => {
      const result = renderJson({ name: 'test', count: 5 }, true)
      render(<>{result}</>)

      expect(screen.getByText('JSON')).toBeInTheDocument()
    })
  })

  describe('renderObject', () => {
    it('returns null when data is undefined', () => {
      const result = renderObject('Test Label', undefined)
      expect(result).toBeNull()
    })

    it('renders object with custom label', () => {
      const result = renderObject('Configuration', { setting: 'enabled' })
      render(<>{result}</>)

      expect(screen.getByText('Configuration')).toBeInTheDocument()
    })

    it('renders nested object', () => {
      const result = renderObject('Settings', {
        db: { host: 'localhost', port: 5432 },
      })
      render(<>{result}</>)

      expect(screen.getByText('Settings')).toBeInTheDocument()
    })
  })

  describe('renderText', () => {
    it('returns null when text is undefined', () => {
      const result = renderText('Label', undefined)
      expect(result).toBeNull()
    })

    it('returns null when text is null', () => {
      const result = renderText('Label', null as unknown as string)
      expect(result).toBeNull()
    })

    it('returns null when text is empty string', () => {
      const result = renderText('Label', '')
      expect(result).toBeNull()
    })

    it('renders text with label', () => {
      const result = renderText('Description', 'This is a test')
      render(<>{result}</>)

      expect(screen.getByText('Description')).toBeInTheDocument()
      expect(screen.getByText('This is a test')).toBeInTheDocument()
    })

    it('renders multi-line text', () => {
      const result = renderText('Script', 'line 1\nline 2\nline 3')
      render(<>{result}</>)

      expect(screen.getByText('Script')).toBeInTheDocument()
      expect(screen.getByText(/line 1/)).toBeInTheDocument()
    })

    it('renders text with special characters', () => {
      const result = renderText('Command', 'echo "hello world" && exit 0')
      render(<>{result}</>)

      expect(screen.getByText(/echo "hello world"/)).toBeInTheDocument()
    })
  })
})
