import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { CodeBlock } from './CodeBlock'

describe('CodeBlock', () => {
  // Mock clipboard API - store ref to mock so we can assert on it
  const originalClipboard = navigator.clipboard
  let mockWriteText: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockWriteText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: mockWriteText,
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
    // eslint-disable-next-line testing-library/prefer-user-event -- userEvent does not trigger PF ClipboardCopyButton tooltip in jsdom
    fireEvent.click(copyButton)

    expect(mockWriteText).toHaveBeenCalledWith('code to copy')
    await waitFor(() => {
      expect(screen.getByText('Copied to clipboard')).toBeInTheDocument()
    })
  })

  it('shows "Copied to clipboard" after successful copy', async () => {
    render(<CodeBlock enableCopy>code</CodeBlock>)

    const copyButton = screen.getByRole('button', { name: 'Copy to clipboard' })
    // eslint-disable-next-line testing-library/prefer-user-event -- userEvent does not trigger PF ClipboardCopyButton tooltip in jsdom
    fireEvent.click(copyButton)

    await waitFor(() => {
      expect(screen.getByText('Copied to clipboard')).toBeInTheDocument()
    })
  })

  it('copies JSON object to clipboard', async () => {
    const jsonObject = { test: 'value' }
    render(<CodeBlock enableCopy jsonObject={jsonObject} />)

    const copyButton = screen.getByRole('button', { name: 'Copy to clipboard' })
    // eslint-disable-next-line testing-library/prefer-user-event -- userEvent does not trigger PF ClipboardCopyButton tooltip in jsdom
    fireEvent.click(copyButton)

    expect(mockWriteText).toHaveBeenCalledWith(JSON.stringify(jsonObject, undefined, 2))
    await waitFor(() => {
      expect(screen.getByText('Copied to clipboard')).toBeInTheDocument()
    })
  })

  it('does not show success label when clipboard write fails', async () => {
    const rejectWriteText = vi.fn().mockRejectedValue(new Error('Clipboard error'))
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: rejectWriteText,
      },
      writable: true,
      configurable: true,
    })

    render(<CodeBlock enableCopy>code</CodeBlock>)

    const copyButton = screen.getByRole('button', { name: 'Copy to clipboard' })
    // Direct userEvent.click (no userEvent.setup()) avoids TL replacing navigator.clipboard with its stub.
    await userEvent.click(copyButton)

    await waitFor(() => {
      expect(rejectWriteText).toHaveBeenCalledWith('code')
    })
    await Promise.resolve()
    expect(screen.queryByText('Copied to clipboard')).not.toBeInTheDocument()
    expect(copyButton).toHaveAccessibleName('Copy to clipboard')
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

  it('does not copy when clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      writable: true,
      configurable: true,
    })

    render(<CodeBlock enableCopy>code</CodeBlock>)

    const copyButton = screen.getByRole('button', { name: 'Copy to clipboard' })
    await expect(userEvent.click(copyButton)).resolves.toBeUndefined()
  })

  describe('expand modal', () => {
    it('does not render expand button by default', () => {
      render(<CodeBlock>code</CodeBlock>)

      expect(screen.queryByRole('button', { name: 'Expand code' })).not.toBeInTheDocument()
    })

    it('renders expand button when enableExpand is true', () => {
      render(<CodeBlock enableExpand>code</CodeBlock>)

      expect(screen.getByRole('button', { name: 'Expand code' })).toBeInTheDocument()
    })

    it('opens modal when expand button is clicked', async () => {
      const user = userEvent.setup()
      render(
        <CodeBlock enableExpand expandTitle="Output JSON">
          code content
        </CodeBlock>
      )

      await user.click(screen.getByRole('button', { name: 'Expand code' }))

      expect(screen.getByRole('dialog', { name: 'Output JSON' })).toBeInTheDocument()
      expect(screen.getAllByText('code content').length).toBeGreaterThan(0)
    })

    it('closes modal when X button is clicked', async () => {
      const user = userEvent.setup()
      render(
        <CodeBlock enableExpand expandTitle="Output JSON">
          code content
        </CodeBlock>
      )

      await user.click(screen.getByRole('button', { name: 'Expand code' }))
      expect(screen.getByRole('dialog')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Close' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('shows copy button inside modal when enableCopy is true', async () => {
      const user = userEvent.setup()
      render(
        <CodeBlock enableExpand enableCopy expandTitle="Output JSON">
          code content
        </CodeBlock>
      )

      await user.click(screen.getByRole('button', { name: 'Expand code' }))

      const dialog = screen.getByRole('dialog')
      expect(dialog).toBeInTheDocument()
      // copy button is inside the modal's PFCodeBlock actions, not in a footer
      const copyButtons = screen.getAllByRole('button', { name: 'Copy to clipboard' })
      expect(copyButtons.length).toBeGreaterThan(0)
    })

    it('modal has no footer element', async () => {
      const user = userEvent.setup()
      const { container } = render(
        <CodeBlock enableExpand expandTitle="Output JSON">
          code
        </CodeBlock>
      )

      await user.click(screen.getByRole('button', { name: 'Expand code' }))

      expect(container.querySelector('.pf-v6-c-modal-box__footer')).not.toBeInTheDocument()
    })
  })
})
