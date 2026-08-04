import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { axe } from 'vitest-axe'

import { CopyToEditorDialog } from './CopyToEditorDialog'

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderDialog(overrides: Partial<Parameters<typeof CopyToEditorDialog>[0]> = {}) {
  const defaults = {
    isOpen: true,
    onClose: vi.fn(),
    onReplace: vi.fn(),
    onFork: vi.fn(),
    isForkLoading: false,
    ...overrides,
  }
  return { ...render(<CopyToEditorDialog {...defaults} />), ...defaults }
}

describe('CopyToEditorDialog', () => {
  it('renders dialog title and body when open', () => {
    renderDialog()
    expect(screen.getByRole('heading', { name: 'Copy run to editor' })).toBeInTheDocument()
    expect(screen.getByText(/Copy this specific run of the automation/)).toBeInTheDocument()
  })

  it('renders all three action buttons', () => {
    renderDialog()
    expect(screen.getByRole('button', { name: 'Replace current workflow' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fork as new workflow' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('calls onReplace when replace button is clicked', async () => {
    const user = userEvent.setup()
    const { onReplace } = renderDialog()
    await user.click(screen.getByRole('button', { name: 'Replace current workflow' }))
    expect(onReplace).toHaveBeenCalledOnce()
  })

  it('calls onFork when fork button is clicked', async () => {
    const user = userEvent.setup()
    const { onFork } = renderDialog()
    await user.click(screen.getByRole('button', { name: 'Fork as new workflow' }))
    expect(onFork).toHaveBeenCalledOnce()
  })

  it('calls onClose when cancel button is clicked', async () => {
    const user = userEvent.setup()
    const { onClose } = renderDialog()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not render when closed', () => {
    renderDialog({ isOpen: false })
    expect(screen.queryByRole('heading', { name: 'Copy run to editor' })).not.toBeInTheDocument()
  })

  it('displays the note about unsaved changes for replace', () => {
    renderDialog()
    expect(screen.getByText(/will overwrite any unsaved changes/)).toBeInTheDocument()
  })

  it('disables all buttons when fork is loading', () => {
    renderDialog({ isForkLoading: true })
    expect(screen.getByRole('button', { name: 'Replace current workflow' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Fork as new workflow/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('has no accessibility violations when open', async () => {
    const { container } = renderDialog()
    expect(await axe(container)).toHaveNoViolations()
  })
})
