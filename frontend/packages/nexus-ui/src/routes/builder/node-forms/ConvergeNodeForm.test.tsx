import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ConvergeNodeForm, type ConvergeFormData } from './ConvergeNodeForm'
import { renderWithHeader } from './test-utils/renderWithHeader'

vi.mock('../hooks/useWorkflowEngineDefaults', () => ({
  useWorkflowEngineDefaults: () => ({ defaults: null, isLoading: false }),
}))

describe('ConvergeNodeForm', () => {
  const mockOnSubmit = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('renders name field', () => {
      renderWithHeader(<ConvergeNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByPlaceholderText(/Enter activity name/i)).toBeInTheDocument()
    })

    it('renders strategy selector', () => {
      renderWithHeader(<ConvergeNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByRole('button', { name: 'Continue when criteria' })).toBeInTheDocument()
    })

    it('renders help popovers for strategy and branch count fields', () => {
      renderWithHeader(<ConvergeNodeForm onSubmit={mockOnSubmit} initialData={{ strategy: 'any' }} />)

      expect(screen.getAllByRole('button', { name: /more info/i }).length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('Strategy "any" Fields', () => {
    it('does not render "any" fields when strategy is "all"', () => {
      renderWithHeader(<ConvergeNodeForm onSubmit={mockOnSubmit} />)

      expect(
        screen.queryByRole('spinbutton', { name: /Required number of branches before continuing/i })
      ).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/Behavior of remaining paths/i)).not.toBeInTheDocument()
    })

    it('renders "any" fields when strategy is "any"', () => {
      renderWithHeader(<ConvergeNodeForm onSubmit={mockOnSubmit} initialData={{ strategy: 'any' }} />)

      expect(
        screen.getByRole('spinbutton', { name: /Required number of branches before continuing/i })
      ).toBeInTheDocument()
      expect(screen.queryByLabelText(/Behavior of remaining paths/i)).not.toBeInTheDocument()
    })

    it('submits "any" strategy data with required fields', async () => {
      const user = userEvent.setup()
      renderWithHeader(
        <ConvergeNodeForm onSubmit={mockOnSubmit} initialData={{ strategy: 'any', requiredPathCount: 1 }} />
      )

      await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Any Strategy')
      const branchCountInput = screen.getByRole('spinbutton', {
        name: /Required number of branches before continuing/i,
      })
      await user.clear(branchCountInput)
      await user.type(branchCountInput, '3')

      fireEvent.submit(screen.getByTestId('converge-node-form'))

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            strategy: 'any',
            requiredPathCount: 3,
          })
        )
      })
    })
  })

  describe('Initial Data', () => {
    it('pre-populates form with initialData', () => {
      const initialData: Partial<ConvergeFormData> = {
        name: 'Existing Converge',
        strategy: 'all',
        settings: { continue_on_failure: false },
      }

      renderWithHeader(<ConvergeNodeForm onSubmit={mockOnSubmit} initialData={initialData} />)

      expect(screen.getByPlaceholderText(/Enter activity name/i)).toHaveValue('Existing Converge')
      expect(screen.getByRole('button', { name: 'Continue when criteria' })).toHaveTextContent(
        'All branches reach this step'
      )
    })
  })

  describe('Default Values', () => {
    it('defaults strategy to "all"', () => {
      renderWithHeader(<ConvergeNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByRole('button', { name: 'Continue when criteria' })).toHaveTextContent(
        'All branches reach this step'
      )
    })
  })

  describe('Header Content', () => {
    it('calls onHeaderContentChange with name field', () => {
      const mockOnHeaderContentChange = vi.fn()
      render(<ConvergeNodeForm onSubmit={mockOnSubmit} onHeaderContentChange={mockOnHeaderContentChange} />)

      expect(mockOnHeaderContentChange).toHaveBeenCalledWith(expect.anything())
    })

    it('cleans up header content on unmount', () => {
      const mockOnHeaderContentChange = vi.fn()
      const { unmount } = render(
        <ConvergeNodeForm onSubmit={mockOnSubmit} onHeaderContentChange={mockOnHeaderContentChange} />
      )

      mockOnHeaderContentChange.mockClear()
      unmount()

      expect(mockOnHeaderContentChange).toHaveBeenCalledWith(null)
    })
  })

  describe('Validation', () => {
    it('strategy select always has a valid value (cannot be reset to empty)', () => {
      renderWithHeader(<ConvergeNodeForm onSubmit={mockOnSubmit} />)

      const strategyToggle = screen.getByRole('button', { name: 'Continue when criteria' })
      expect(strategyToggle).toHaveTextContent('All branches reach this step')
    })
  })

  describe('Form Submission', () => {
    it('does not include requiredPathCount when strategy is "all"', async () => {
      const user = userEvent.setup()
      renderWithHeader(<ConvergeNodeForm onSubmit={mockOnSubmit} />)

      await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'All Strategy')

      fireEvent.submit(screen.getByTestId('converge-node-form'))

      await waitFor(() => {
        const submittedData = mockOnSubmit.mock.calls[0][0] as ConvergeFormData
        expect(submittedData.requiredPathCount).toBeUndefined()
      })
    })

    it('defaults requiredPathCount to 1', async () => {
      const user = userEvent.setup()
      const initialData: Partial<ConvergeFormData> = { strategy: 'all' }
      renderWithHeader(<ConvergeNodeForm onSubmit={mockOnSubmit} initialData={initialData} />)

      await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Test Converge')

      fireEvent.submit(screen.getByTestId('converge-node-form'))

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Test Converge',
            strategy: 'all',
          })
        )
      })
    })
  })
})
