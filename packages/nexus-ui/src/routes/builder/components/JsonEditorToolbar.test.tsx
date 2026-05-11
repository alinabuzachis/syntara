import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { JsonEditorControls } from './JsonEditorToolbar'

vi.mock('@patternfly/react-code-editor', () => ({
  CodeEditorControl: ({
    'aria-label': ariaLabel,
    onClick,
  }: {
    'aria-label': string
    onClick: () => void
    icon: React.ReactNode
    tooltipProps: { content: string }
  }) => (
    <button aria-label={ariaLabel} onClick={onClick} type="button">
      {ariaLabel}
    </button>
  ),
}))

function renderControls(overrides: Partial<React.ComponentProps<typeof JsonEditorControls>> = {}) {
  const props: React.ComponentProps<typeof JsonEditorControls> = {
    code: '{"key": "value"}',
    onCodeChange: vi.fn(),
    defaultCode: '{}',
    downloadFilename: 'test.json',
    ...overrides,
  }
  return { ...render(<JsonEditorControls {...props} />), props }
}

describe('JsonEditorControls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders upload, copy, download, and reset controls', () => {
    renderControls()

    expect(screen.getByRole('button', { name: 'Upload JSON file' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy to clipboard' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download as JSON' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset to default' })).toBeInTheDocument()
  })

  it('does not render example button when exampleCode is not provided', () => {
    renderControls()

    expect(screen.queryByRole('button', { name: 'Insert example' })).not.toBeInTheDocument()
  })

  it('renders example button when exampleCode is provided', () => {
    renderControls({ exampleCode: '{"example": true}' })

    expect(screen.getByRole('button', { name: 'Insert example' })).toBeInTheDocument()
  })

  it('calls onCodeChange with exampleCode when example button is clicked', async () => {
    const user = userEvent.setup()
    const { props } = renderControls({ exampleCode: '{"example": true}' })

    await user.click(screen.getByRole('button', { name: 'Insert example' }))

    expect(props.onCodeChange).toHaveBeenCalledWith('{"example": true}')
  })

  it('calls onCodeChange with defaultCode when reset is clicked', async () => {
    const user = userEvent.setup()
    const { props } = renderControls({ defaultCode: '{"default": true}' })

    await user.click(screen.getByRole('button', { name: 'Reset to default' }))

    expect(props.onCodeChange).toHaveBeenCalledWith('{"default": true}')
  })

  it('copies code to clipboard when copy is clicked', async () => {
    const user = userEvent.setup()
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    })

    renderControls({ code: '{"copy": "me"}' })

    await user.click(screen.getByRole('button', { name: 'Copy to clipboard' }))

    expect(writeTextMock).toHaveBeenCalledWith('{"copy": "me"}')
  })

  it('creates a download link when download is clicked', async () => {
    const user = userEvent.setup()
    const clickSpy = vi.fn()
    const createElementOriginal = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = createElementOriginal(tag)
      if (tag === 'a') {
        vi.spyOn(el, 'click').mockImplementation(clickSpy)
      }
      return el
    })

    renderControls({ code: '{"dl": true}', downloadFilename: 'export.json' })

    await user.click(screen.getByRole('button', { name: 'Download as JSON' }))

    expect(clickSpy).toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  describe('accessibility', () => {
    it('has no violations', async () => {
      const { container } = renderControls()
      expect(await axe(container)).toHaveNoViolations()
    })
  })
})
