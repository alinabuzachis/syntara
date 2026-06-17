import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { ColorSchemeProvider } from '../../../providers/theme/ColorSchemeProvider'

import { MockDataEditor } from './MockDataEditor'

function renderWithProviders(ui: ReactElement) {
  return render(<ColorSchemeProvider>{ui}</ColorSchemeProvider>)
}

describe('MockDataEditor', () => {
  const mockOnPin = vi.fn()
  const mockOnCancel = vi.fn()
  const defaultProps = {
    predecessorName: 'Test Node',
    initialJson: '{"field1": "value1"}',
    onPin: mockOnPin,
    onCancel: mockOnCancel,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the predecessor name', () => {
    renderWithProviders(<MockDataEditor {...defaultProps} />)
    expect(screen.getByText(/Editing mock data for: Test Node/i)).toBeInTheDocument()
  })

  it('renders the code editor component', () => {
    renderWithProviders(<MockDataEditor {...defaultProps} />)
    expect(screen.getByTestId('inline-code-editor')).toBeInTheDocument()
  })

  it('shows Pin data and Cancel buttons', () => {
    renderWithProviders(<MockDataEditor {...defaultProps} />)
    expect(screen.getByRole('button', { name: /pin data/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('calls onCancel when Cancel button is clicked', async () => {
    const user = userEvent.setup()
    renderWithProviders(<MockDataEditor {...defaultProps} />)

    const cancelButton = screen.getByRole('button', { name: /cancel/i })
    await user.click(cancelButton)

    expect(mockOnCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onPin with parsed JSON when Pin data button is clicked with valid JSON', async () => {
    const user = userEvent.setup()
    renderWithProviders(<MockDataEditor {...defaultProps} />)

    const pinButton = screen.getByRole('button', { name: /pin data/i })
    await user.click(pinButton)

    expect(mockOnPin).toHaveBeenCalledWith({ field1: 'value1' })
  })

  it('has Input heading', () => {
    renderWithProviders(<MockDataEditor {...defaultProps} />)
    expect(screen.getByRole('heading', { name: /^input$/i, level: 2 })).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = renderWithProviders(<MockDataEditor {...defaultProps} />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
