import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { InlineMockEditor } from './InlineMockEditor'

// Mock the ExpandableCodeEditor to make it testable
vi.mock('../components/ExpandableCodeEditor', () => ({
  ExpandableCodeEditor: ({
    code,
    onCodeChange,
    ariaLabel,
  }: {
    code: string
    onCodeChange: (code: string) => void
    ariaLabel?: string
  }) => (
    <div role="region" aria-label={ariaLabel ?? 'Code editor'}>
      <textarea aria-label={ariaLabel ?? 'Code editor'} value={code} onChange={(e) => onCodeChange(e.target.value)} />
    </div>
  ),
}))

// The component renders as a fragment; wrap in a Stack so StackItem children are valid
function renderInlineMockEditor(props: Parameters<typeof InlineMockEditor>[0]) {
  return render(
    <div>
      <InlineMockEditor {...props} />
    </div>
  )
}

describe('InlineMockEditor', () => {
  const defaultProps = {
    code: '{"key": "value"}',
    onCodeChange: vi.fn(),
    onPin: vi.fn(),
    onCancel: vi.fn(),
    jsonError: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders with required props', () => {
    renderInlineMockEditor(defaultProps)

    expect(screen.getByRole('button', { name: 'Pin data' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Mock data editor' })).toBeInTheDocument()
  })

  it('renders code editor with initial value', () => {
    renderInlineMockEditor(defaultProps)

    const editor = screen.getByRole('textbox', { name: 'Mock data editor' })
    expect(editor).toHaveValue('{"key": "value"}')
  })

  it('shows error message when jsonError prop is provided', () => {
    renderInlineMockEditor({ ...defaultProps, jsonError: 'Invalid JSON syntax' })

    expect(screen.getByText('Invalid JSON syntax')).toBeInTheDocument()
  })

  it('links error message to pin button via aria-describedby', () => {
    renderInlineMockEditor({ ...defaultProps, jsonError: 'Invalid JSON syntax' })

    const pinButton = screen.getByRole('button', { name: 'Pin data' })
    expect(pinButton).toHaveAttribute('aria-describedby')
    expect(screen.getByText('Invalid JSON syntax')).toBeInTheDocument()
  })

  it('does not set aria-describedby on pin button when no error', () => {
    renderInlineMockEditor(defaultProps)

    const pinButton = screen.getByRole('button', { name: 'Pin data' })
    expect(pinButton).not.toHaveAttribute('aria-describedby')
  })

  it('does not render error message when jsonError is null', () => {
    renderInlineMockEditor(defaultProps)

    expect(screen.queryByText('Invalid JSON syntax')).not.toBeInTheDocument()
  })

  it('calls onPin when pin button is clicked', async () => {
    const user = userEvent.setup()
    const onPin = vi.fn()
    renderInlineMockEditor({ ...defaultProps, onPin })

    await user.click(screen.getByRole('button', { name: 'Pin data' }))

    expect(onPin).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    renderInlineMockEditor({ ...defaultProps, onCancel })

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('uses custom pinButtonLabel when provided', () => {
    renderInlineMockEditor({ ...defaultProps, pinButtonLabel: 'Save mock' })

    expect(screen.getByRole('button', { name: 'Save mock' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pin data' })).not.toBeInTheDocument()
  })

  it('uses custom ariaLabel when provided', () => {
    renderInlineMockEditor({ ...defaultProps, ariaLabel: 'Custom editor label' })

    expect(screen.getByRole('region', { name: 'Custom editor label' })).toBeInTheDocument()
  })

  it('calls onCodeChange when editor content changes', async () => {
    const user = userEvent.setup()
    const onCodeChange = vi.fn()
    renderInlineMockEditor({ ...defaultProps, onCodeChange })

    const editor = screen.getByRole('textbox', { name: 'Mock data editor' })
    await user.clear(editor)
    await user.type(editor, 'new value')

    expect(onCodeChange).toHaveBeenCalled()
  })

  it('has no accessibility violations', async () => {
    const { container } = renderInlineMockEditor(defaultProps)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations with error message', async () => {
    const { container } = renderInlineMockEditor({ ...defaultProps, jsonError: 'Invalid JSON' })

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
