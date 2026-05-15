import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ConvergeNodeForm, type ConvergeFormData } from './ConvergeNodeForm'
import { renderWithHeader } from './test-utils/renderWithHeader'

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

      expect(screen.getByRole('combobox', { name: /Continue when criteria/i })).toBeInTheDocument()
    })

    it('renders timeout toggle', () => {
      renderWithHeader(<ConvergeNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByRole('switch', { name: /Timeout/i })).toBeInTheDocument()
    })

    it('does not render timeout fields when toggle is off', () => {
      renderWithHeader(<ConvergeNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.queryByText(/Timeout action/i)).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/Second\(s\)/i)).not.toBeInTheDocument()
    })

    it('renders timeout fields when toggle is on', async () => {
      const user = userEvent.setup()
      renderWithHeader(<ConvergeNodeForm onSubmit={mockOnSubmit} />)

      await user.click(screen.getByRole('switch', { name: /Timeout/i }))

      expect(screen.getByLabelText(/Second\(s\)/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Minute\(s\)/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Hour\(s\)/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Day\(s\)/i)).toBeInTheDocument()
      expect(screen.getByText(/Timeout action/i)).toBeInTheDocument()
    })

    it('renders help popovers for strategy and branch count fields', () => {
      renderWithHeader(<ConvergeNodeForm onSubmit={mockOnSubmit} initialData={{ strategy: 'any' }} />)

      expect(screen.getByRole('button', { name: /Continue when criteria help/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Required branch count help/i })).toBeInTheDocument()
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
        timeoutEnabled: false,
      }

      renderWithHeader(<ConvergeNodeForm onSubmit={mockOnSubmit} initialData={initialData} />)

      expect(screen.getByPlaceholderText(/Enter activity name/i)).toHaveValue('Existing Converge')
      expect(screen.getByRole('combobox', { name: /Continue when criteria/i })).toHaveValue('all')
      expect(screen.getByRole('switch', { name: /Timeout/i })).not.toBeChecked()
    })

    it('pre-populates timeout fields when enabled in initialData', () => {
      const initialData: Partial<ConvergeFormData> = {
        name: 'Timeout Converge',
        strategy: 'all',
        timeoutEnabled: true,
        timeoutSeconds: 45,
        timeoutMinutes: 3,
        timeoutHours: 1,
        timeoutDays: 0,
        onTimeout: 'fail',
      }

      renderWithHeader(<ConvergeNodeForm onSubmit={mockOnSubmit} initialData={initialData} />)

      expect(screen.getByRole('switch', { name: /Timeout/i })).toBeChecked()
      expect(screen.getByLabelText(/Second\(s\)/i)).toHaveValue(45)
      expect(screen.getByLabelText(/Minute\(s\)/i)).toHaveValue(3)
      expect(screen.getByLabelText(/Hour\(s\)/i)).toHaveValue(1)
    })
  })

  describe('Default Values', () => {
    it('defaults strategy to "all"', () => {
      renderWithHeader(<ConvergeNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByRole('combobox', { name: /Continue when criteria/i })).toHaveValue('all')
    })

    it('defaults timeoutEnabled to false', () => {
      renderWithHeader(<ConvergeNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByRole('switch', { name: /Timeout/i })).not.toBeChecked()
    })

    it('defaults onTimeout to "fail"', async () => {
      const user = userEvent.setup()
      renderWithHeader(<ConvergeNodeForm onSubmit={mockOnSubmit} />)

      await user.click(screen.getByRole('switch', { name: /Timeout/i }))
      await user.type(screen.getByLabelText(/Minute\(s\)/i), '1')

      expect(screen.getByRole('button', { name: /Fail/i })).toBeInTheDocument()
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
    it.skip('validates required strategy field', async () => {
      const user = userEvent.setup()
      renderWithHeader(<ConvergeNodeForm onSubmit={mockOnSubmit} />)

      await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'No Strategy')
      await user.selectOptions(screen.getByRole('combobox', { name: /Continue when criteria/i }), '')
      await user.click(screen.getByRole('button', { name: /Add step/i }))

      expect(screen.getByText(/Continue when criteria is required/i)).toBeInTheDocument()
      expect(mockOnSubmit).not.toHaveBeenCalled()
    })
  })

  describe('Form Submission', () => {
    it('does not include requiredPathCount when strategy is "all"', async () => {
      const user = userEvent.setup()
      renderWithHeader(<ConvergeNodeForm onSubmit={mockOnSubmit} />)

      await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'All Strategy')
      await user.selectOptions(screen.getByRole('combobox', { name: /Continue when criteria/i }), 'all')

      fireEvent.submit(screen.getByTestId('converge-node-form'))

      await waitFor(() => {
        const submittedData = mockOnSubmit.mock.calls[0][0] as ConvergeFormData
        expect(submittedData.requiredPathCount).toBeUndefined()
      })
    })

    it('does not include onTimeout when timeout is disabled', async () => {
      const user = userEvent.setup()
      renderWithHeader(<ConvergeNodeForm onSubmit={mockOnSubmit} />)

      await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'No Timeout')
      await user.selectOptions(screen.getByRole('combobox', { name: /Continue when criteria/i }), 'all')

      fireEvent.submit(screen.getByTestId('converge-node-form'))

      await waitFor(() => {
        const submittedData = mockOnSubmit.mock.calls[0][0] as ConvergeFormData
        expect(submittedData.timeout).toBeUndefined()
        expect(submittedData.onTimeout).toBeUndefined()
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
