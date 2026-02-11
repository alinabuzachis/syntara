import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { CodeBlock } from './CodeBlock'

describe('CodeBlock', () => {
  // Mock clipboard API
  const originalClipboard = navigator.clipboard

  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      writable: true,
      configurable: true,
    })
    vi.restoreAllMocks()
  })

  it('renders string children', () => {
    render(<CodeBlock>console.log('hello')</CodeBlock>)

    expect(screen.getByText("console.log('hello')")).toBeInTheDocument()
  })

  it('renders JSON object formatted', () => {
    const jsonObject = { name: 'test', value: 123 }
    render(<CodeBlock jsonObject={jsonObject} />)

    expect(screen.getByText(/"name": "test"/)).toBeInTheDocument()
    expect(screen.getByText(/"value": 123/)).toBeInTheDocument()
  })

  it('renders as PatternFly CodeBlock', () => {
    const { container } = render(<CodeBlock>code</CodeBlock>)

    const codeBlock = container.querySelector('.pf-v6-c-code-block')
    expect(codeBlock).toBeInTheDocument()
  })

  it('renders with maxHeight by default', () => {
    const { container } = render(<CodeBlock>code</CodeBlock>)

    const wrapper = container.firstChild as HTMLElement
    expect(wrapper).toHaveStyle({ maxHeight: '24rem' })
  })

  it('renders without maxHeight when noMaxHeight is true', () => {
    const { container } = render(<CodeBlock noMaxHeight>code</CodeBlock>)

    const codeBlock = container.querySelector('.pf-v6-c-code-block')
    // When noMaxHeight, the wrapper div is not rendered
    expect(codeBlock?.parentElement).not.toHaveStyle({ maxHeight: '24rem' })
  })

  it('renders with fillHeight style', () => {
    const { container } = render(<CodeBlock fillHeight>code</CodeBlock>)

    const wrapper = container.firstChild as HTMLElement
    expect(wrapper).toHaveStyle({ height: '100%' })
  })

  it('does not show copy button by default', () => {
    render(<CodeBlock>code</CodeBlock>)

    expect(screen.queryByRole('button', { name: 'Copy to clipboard' })).not.toBeInTheDocument()
  })

  it('shows copy button when enableCopy is true', () => {
    render(<CodeBlock enableCopy>code</CodeBlock>)

    expect(screen.getByRole('button', { name: 'Copy to clipboard' })).toBeInTheDocument()
  })

  it('copies text to clipboard when copy button clicked', async () => {
    render(<CodeBlock enableCopy>code to copy</CodeBlock>)

    const copyButton = screen.getByRole('button', { name: 'Copy to clipboard' })
    fireEvent.click(copyButton)

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('code to copy')
  })

  it('shows "Copied to clipboard" after successful copy', async () => {
    render(<CodeBlock enableCopy>code</CodeBlock>)

    const copyButton = screen.getByRole('button', { name: 'Copy to clipboard' })
    fireEvent.click(copyButton)

    await waitFor(() => {
      expect(screen.getByText('Copied to clipboard')).toBeInTheDocument()
    })
  })

  it('copies JSON object to clipboard', async () => {
    const jsonObject = { test: 'value' }
    render(<CodeBlock enableCopy jsonObject={jsonObject} />)

    const copyButton = screen.getByRole('button', { name: 'Copy to clipboard' })
    fireEvent.click(copyButton)

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(JSON.stringify(jsonObject, undefined, 2))
  })

  it('handles clipboard write failure gracefully', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockRejectedValue(new Error('Clipboard error')),
      },
      writable: true,
      configurable: true,
    })

    render(<CodeBlock enableCopy>code</CodeBlock>)

    const copyButton = screen.getByRole('button', { name: 'Copy to clipboard' })
    fireEvent.click(copyButton)

    // Even on failure, it should show "Copied" briefly
    await waitFor(() => {
      expect(screen.getByText('Copied to clipboard')).toBeInTheDocument()
    })
  })

  it('renders children over jsonObject when both provided', () => {
    render(<CodeBlock jsonObject={{ ignored: true }}>preferred content</CodeBlock>)

    expect(screen.getByText('preferred content')).toBeInTheDocument()
    expect(screen.queryByText('ignored')).not.toBeInTheDocument()
  })

  it('handles empty content gracefully', () => {
    const { container } = render(<CodeBlock />)

    const codeBlock = container.querySelector('.pf-v6-c-code-block')
    expect(codeBlock).toBeInTheDocument()
  })

  it('does not copy when clipboard is unavailable', () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      writable: true,
      configurable: true,
    })

    render(<CodeBlock enableCopy>code</CodeBlock>)

    const copyButton = screen.getByRole('button', { name: 'Copy to clipboard' })
    // Should not throw when clicked
    expect(() => fireEvent.click(copyButton)).not.toThrow()
  })
})
