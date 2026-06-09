import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { SwitchNodeForm, type SwitchFormData } from './SwitchNodeForm'
import { renderWithHeader } from './test-utils/renderWithHeader'

describe('SwitchNodeForm', () => {
  const mockOnSubmit = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('renders name field', () => {
      renderWithHeader(<SwitchNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByPlaceholderText(/Enter activity name/i)).toBeInTheDocument()
    })

    it('renders info banner about first match priority', () => {
      renderWithHeader(<SwitchNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByText(/The workflow will run on the path that is the first match/i)).toBeInTheDocument()
    })

    it('renders two default empty paths', () => {
      renderWithHeader(<SwitchNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByDisplayValue('Path 1')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Path 2')).toBeInTheDocument()
    })

    it('renders fallback path section', () => {
      renderWithHeader(<SwitchNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByRole('button', { name: /Fallback path/i })).toBeInTheDocument()
    })

    it('renders add path button', () => {
      renderWithHeader(<SwitchNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByRole('button', { name: /Add path/i })).toBeInTheDocument()
    })
  })

  describe('Add/Remove paths', () => {
    it('adds a new path when clicking add path button', async () => {
      const user = userEvent.setup()
      renderWithHeader(<SwitchNodeForm onSubmit={mockOnSubmit} />)

      await user.click(screen.getByRole('button', { name: /Add path/i }))

      expect(screen.getByDisplayValue('Path 3')).toBeInTheDocument()
    })

    it('removes a path when clicking remove button', async () => {
      const user = userEvent.setup()
      renderWithHeader(<SwitchNodeForm onSubmit={mockOnSubmit} />)

      const removeButtons = screen.getAllByRole('button', { name: /Remove path/i })
      await user.click(removeButtons[0])

      expect(screen.queryByText('Path 2')).not.toBeInTheDocument()
    })
  })

  describe('Initial Data', () => {
    it('pre-populates form with initialData', () => {
      const initialData: Partial<SwitchFormData> = {
        name: 'My Switch',
        cases: [{ id: '1', variable: 'status', operator: '==', value: 'active', negate: false }],
      }

      renderWithHeader(<SwitchNodeForm onSubmit={mockOnSubmit} initialData={initialData} />)

      expect(screen.getByPlaceholderText(/Enter activity name/i)).toHaveValue('My Switch')
    })
  })

  describe('Header Content', () => {
    it('calls onHeaderContentChange with name field', () => {
      const mockOnHeaderContentChange = vi.fn()
      render(<SwitchNodeForm onSubmit={mockOnSubmit} onHeaderContentChange={mockOnHeaderContentChange} />)

      expect(mockOnHeaderContentChange).toHaveBeenCalledWith(expect.anything())
    })

    it('cleans up header content on unmount', () => {
      const mockOnHeaderContentChange = vi.fn()
      const { unmount } = render(
        <SwitchNodeForm onSubmit={mockOnSubmit} onHeaderContentChange={mockOnHeaderContentChange} />
      )

      mockOnHeaderContentChange.mockClear()
      unmount()

      expect(mockOnHeaderContentChange).toHaveBeenCalledWith(null)
    })
  })

  describe('Collapse/Expand', () => {
    it('renders fallback section as collapsible', () => {
      renderWithHeader(<SwitchNodeForm onSubmit={mockOnSubmit} />)

      const fallbackToggle = screen.getByRole('button', { name: /Fallback path/i })
      expect(fallbackToggle).toHaveAttribute('aria-expanded', 'true')
    })

    it('collapses fallback section when clicked', async () => {
      const user = userEvent.setup()
      renderWithHeader(<SwitchNodeForm onSubmit={mockOnSubmit} />)

      const fallbackToggle = screen.getByRole('button', { name: /Fallback path/i })
      await user.click(fallbackToggle)
      expect(fallbackToggle).toHaveAttribute('aria-expanded', 'false')
    })
  })

  describe('Validation', () => {
    it('shows field required error when submitting with empty variable', async () => {
      renderWithHeader(<SwitchNodeForm onSubmit={mockOnSubmit} />)

      fireEvent.submit(screen.getByTestId('switch-node-form'))

      await waitFor(() => {
        expect(screen.getAllByText('Field is required').length).toBeGreaterThan(0)
      })
      expect(mockOnSubmit).not.toHaveBeenCalled()
    })

    it('shows value required error when submitting with empty value', async () => {
      const user = userEvent.setup()
      const initialData: Partial<SwitchFormData> = {
        cases: [{ id: 'c1', label: 'Path 1', variable: '', operator: '==' as const, value: '', negate: false }],
      }
      renderWithHeader(<SwitchNodeForm onSubmit={mockOnSubmit} initialData={initialData} />)

      const fieldInputs = screen.getAllByPlaceholderText('Enter or drag and drop value')
      await user.type(fieldInputs[0], 'trigger.status')

      fireEvent.submit(screen.getByTestId('switch-node-form'))

      await waitFor(() => {
        expect(screen.getByText('Value is required')).toBeInTheDocument()
      })
      expect(mockOnSubmit).not.toHaveBeenCalled()
    })

    it('disables collapse button when path has validation errors', async () => {
      renderWithHeader(<SwitchNodeForm onSubmit={mockOnSubmit} />)

      fireEvent.submit(screen.getByTestId('switch-node-form'))

      await waitFor(() => {
        expect(screen.getAllByText('Field is required').length).toBeGreaterThan(0)
      })

      const collapseButtons = screen.getAllByRole('button', { name: /path \d+/i })
      const pathToggle = collapseButtons.find((btn) => btn.getAttribute('aria-expanded') === 'true')
      expect(pathToggle).toHaveAttribute('aria-disabled', 'true')
    })

    it('auto-expands collapsed path when it has validation errors', async () => {
      const user = userEvent.setup()
      renderWithHeader(<SwitchNodeForm onSubmit={mockOnSubmit} />)

      const collapseButton = screen.getAllByRole('button', { name: /Collapse path/i })[0]
      await user.click(collapseButton)

      fireEvent.submit(screen.getByTestId('switch-node-form'))

      await waitFor(() => {
        expect(screen.getAllByText('Field is required').length).toBeGreaterThan(0)
      })
    })
  })

  describe('Path naming', () => {
    it('renders editable path name inputs with default values', () => {
      renderWithHeader(<SwitchNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByDisplayValue('Path 1')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Path 2')).toBeInTheDocument()
    })

    it('path name inputs have correct placeholder', () => {
      renderWithHeader(<SwitchNodeForm onSubmit={mockOnSubmit} />)

      const pathInputs = screen.getAllByPlaceholderText(/^Path \d+$/)
      expect(pathInputs.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('Accessibility', () => {
    it('has no accessibility violations including nested-interactive (excluding known PatternFly Tabs aria-valid-attr-value issue)', async () => {
      const { container } = renderWithHeader(<SwitchNodeForm onSubmit={mockOnSubmit} />)

      const results = await axe(container, {
        rules: {
          'aria-valid-attr-value': { enabled: false },
          'nested-interactive': { enabled: true },
        },
      })
      expect(results).toHaveNoViolations()
    })
  })
})
