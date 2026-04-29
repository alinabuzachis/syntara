import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { highlightText, highlightTextLines } from './highlightText'

describe('highlightText', () => {
  it('returns original text when search term is empty', () => {
    const result = highlightText('Hello World', '')
    expect(result).toBe('Hello World')
  })

  it('returns original text when search term is only whitespace', () => {
    const result = highlightText('Hello World', '   ')
    expect(result).toBe('Hello World')
  })

  it('highlights single match case-insensitively', () => {
    const result = highlightText('Hello World', 'wor')
    const { container } = render(<>{result}</>)

    expect(container.textContent).toBe('Hello World')
    const mark = container.querySelector('mark')
    expect(mark).toBeInTheDocument()
    expect(mark?.textContent).toBe('Wor')
  })

  it('highlights multiple matches', () => {
    const result = highlightText('foo bar foo baz', 'foo')
    const { container } = render(<>{result}</>)

    expect(container.textContent).toBe('foo bar foo baz')
    const marks = container.querySelectorAll('mark')
    expect(marks).toHaveLength(2)
    expect(marks[0]?.textContent).toBe('foo')
    expect(marks[1]?.textContent).toBe('foo')
  })

  it('escapes regex special characters in search term', () => {
    const result = highlightText('Price: $100.00', '$100')
    const { container } = render(<>{result}</>)

    expect(container.textContent).toBe('Price: $100.00')
    const mark = container.querySelector('mark')
    expect(mark?.textContent).toBe('$100')
  })

  it('preserves text when no matches found', () => {
    const result = highlightText('Hello World', 'xyz')
    expect(result).toBe('Hello World')
  })

  it('applies orange background and inherits text color', () => {
    const result = highlightText('Hello World', 'World')
    const { container } = render(<>{result}</>)

    const mark = container.querySelector('mark')
    expect(mark).toHaveStyle({ backgroundColor: 'var(--pf-t--global--color--nonstatus--orange--300)' })
    // Verify color: inherit is in the inline style (not the computed style)
    expect(mark?.getAttribute('style')).toContain('color: inherit')
  })
})

describe('highlightTextLines', () => {
  it('returns original text when search term is empty', () => {
    const text = 'line1\nline2\nline3'
    const result = highlightTextLines(text, '')
    expect(result).toBe(text)
  })

  it('highlights matches across multiple lines', () => {
    const text = 'apple\nbanana\napple pie'
    const result = highlightTextLines(text, 'apple')
    const { container } = render(<>{result}</>)

    expect(container.textContent).toBe('apple\nbanana\napple pie')
    const marks = container.querySelectorAll('mark')
    expect(marks).toHaveLength(2)
    expect(marks[0]?.textContent).toBe('apple')
    expect(marks[1]?.textContent).toBe('apple')
  })

  it('preserves lines without matches', () => {
    const text = 'apple\nbanana\ncherry'
    const result = highlightTextLines(text, 'banana')
    const { container } = render(<>{result}</>)

    expect(container.textContent).toBe('apple\nbanana\ncherry')
    const marks = container.querySelectorAll('mark')
    expect(marks).toHaveLength(1)
    expect(marks[0]?.textContent).toBe('banana')
  })

  it('works with JSON formatted text', () => {
    const json = '{\n  "name": "test",\n  "value": 123\n}'
    const result = highlightTextLines(json, 'name')
    const { container } = render(<>{result}</>)

    expect(container.textContent).toBe(json)
    const mark = container.querySelector('mark')
    expect(mark?.textContent).toBe('name')
  })

  it('preserves newline characters when highlighting', () => {
    const text = 'line1\nline2\nline3'
    const result = highlightTextLines(text, 'line')
    const { container } = render(<>{result}</>)

    // When rendering in DOM, newlines are preserved in textContent
    expect(container.textContent).toBe(text)
    const marks = container.querySelectorAll('mark')
    expect(marks).toHaveLength(3)
  })
})
