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

    it('renders info banner about single path execution', () => {
      renderWithHeader(<SwitchNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByText(/Only one path runs per execution/i)).toBeInTheDocument()
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

  describe('Reorder paths', () => {
    it('renders drag handle for each path', () => {
      renderWithHeader(<SwitchNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByRole('button', { name: 'Reorder path 1' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Reorder path 2' })).toBeInTheDocument()
    })
  })

  describe('Initial Data', () => {
    it('pre-populates form with initialData', () => {
      const initialData: Partial<SwitchFormData> = {
        name: 'My Switch',
        cases: [{ caseId: '1', condition: '${status} == "active"' }],
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
    it('submits form with empty conditions (permissive schema)', async () => {
      renderWithHeader(<SwitchNodeForm onSubmit={mockOnSubmit} />)

      fireEvent.submit(screen.getByTestId('switch-node-form'))

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled()
      })
    })

    it('submits form with empty condition in case (permissive schema)', async () => {
      const initialData: Partial<SwitchFormData> = {
        cases: [{ caseId: 'c1', label: 'Path 1', condition: '' }],
      }
      renderWithHeader(<SwitchNodeForm onSubmit={mockOnSubmit} initialData={initialData} />)

      fireEvent.submit(screen.getByTestId('switch-node-form'))

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled()
      })
    })

    it('allows collapsing paths when conditions are empty (permissive schema)', async () => {
      renderWithHeader(<SwitchNodeForm onSubmit={mockOnSubmit} />)

      fireEvent.submit(screen.getByTestId('switch-node-form'))

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled()
      })

      const collapseButtons = screen.getAllByRole('button', { name: /path \d+/i })
      const pathToggle = collapseButtons.find((btn) => btn.getAttribute('aria-expanded') === 'true')
      expect(pathToggle).not.toHaveAttribute('aria-disabled', 'true')
    })

    it('keeps collapsed paths collapsed when submitting with empty conditions (permissive schema)', async () => {
      const user = userEvent.setup()
      renderWithHeader(<SwitchNodeForm onSubmit={mockOnSubmit} />)

      const collapseButton = screen.getAllByRole('button', { name: /Collapse path/i })[0]
      await user.click(collapseButton)

      fireEvent.submit(screen.getByTestId('switch-node-form'))

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled()
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

  describe('Path expression label', () => {
    it('renders Path expression label for each expanded case', () => {
      renderWithHeader(<SwitchNodeForm onSubmit={mockOnSubmit} />)

      const labels = screen.getAllByText('Path expression')
      expect(labels.length).toBe(2)
    })
  })

  describe('Condition round-trip', () => {
    it('submits with condition string from initial data', async () => {
      const initialData: Partial<SwitchFormData> = {
        name: 'Test',
        cases: [{ caseId: 'c1', label: 'Path 1', condition: '${status} == "active"' }],
      }
      renderWithHeader(<SwitchNodeForm onSubmit={mockOnSubmit} initialData={initialData} />)

      fireEvent.submit(screen.getByTestId('switch-node-form'))

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled()
      })

      const submittedData = mockOnSubmit.mock.calls[0][0] as SwitchFormData
      expect(submittedData.cases[0].condition).toBe('${status} == "active"')
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

    it('has no accessibility violations with single path (excluding known PatternFly Tabs aria-valid-attr-value issue)', async () => {
      const { container } = renderWithHeader(
        <SwitchNodeForm
          onSubmit={mockOnSubmit}
          initialData={{ cases: [{ caseId: 'c1', label: 'Solo', condition: '${x} == 1' }] }}
        />
      )

      const results = await axe(container, {
        rules: {
          // Known false positive: PatternFly Tabs generates aria-selected on non-tab roles
          'aria-valid-attr-value': { enabled: false },
          'nested-interactive': { enabled: true },
        },
      })
      expect(results).toHaveNoViolations()
    })
  })
})
