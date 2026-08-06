import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { UnsavedStepEditorDialog } from './UnsavedStepEditorDialog'

function renderDialog(overrides: Partial<React.ComponentProps<typeof UnsavedStepEditorDialog>> = {}) {
  const props: React.ComponentProps<typeof UnsavedStepEditorDialog> = {
    isOpen: true,
    onClose: vi.fn(),
    ...overrides,
  }
  return { ...render(<UnsavedStepEditorDialog {...props} />), props }
}

describe('UnsavedStepEditorDialog', () => {
  it('has no accessibility violations', async () => {
    const { container } = renderDialog()

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('does not render when isOpen is false', () => {
    renderDialog({ isOpen: false })

    expect(screen.queryByText('Unsaved step changes')).not.toBeInTheDocument()
  })

  it('renders title, body, and single action button when open', () => {
    renderDialog()

    expect(screen.getByText('Unsaved step changes')).toBeInTheDocument()
    expect(
      screen.getByText(
        'You have unsaved changes in the step editor. Save or cancel your step changes before saving the workflow.'
      )
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Return to editor' })).toBeInTheDocument()
  })

  it('calls onClose when Return to editor is clicked', async () => {
    const user = userEvent.setup()
    const { props } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Return to editor' }))

    expect(props.onClose).toHaveBeenCalledOnce()
  })
})
