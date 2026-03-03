import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ConditionNodeForm, type ConditionFormData } from './ConditionNodeForm'
import { renderWithHeader } from './test-utils/renderWithHeader'

describe('ConditionNodeForm', () => {
  const mockOnSubmit = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('renders name field', () => {
      renderWithHeader(<ConditionNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByPlaceholderText(/Enter activity name/i)).toBeInTheDocument()
    })

    it('renders conditional expression field', () => {
      renderWithHeader(<ConditionNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByRole('group', { name: /Expression builder/i })).toBeInTheDocument()
    })

    it('renders submit button with default text', () => {
      renderWithHeader(<ConditionNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByRole('button', { name: /Add node/i })).toBeInTheDocument()
    })

    it('renders submit button with custom text', () => {
      renderWithHeader(<ConditionNodeForm onSubmit={mockOnSubmit} submitButtonText="Update node" />)

      expect(screen.getByRole('button', { name: /Update node/i })).toBeInTheDocument()
    })
  })

  describe('Submission', () => {
    it('submits form with valid condition data', async () => {
      const user = userEvent.setup()
      renderWithHeader(<ConditionNodeForm onSubmit={mockOnSubmit} />)

      await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Test Condition')

      // Switch to raw mode and enter expression
      await user.selectOptions(screen.getByLabelText(/Expression editor mode/i), 'raw')
      const rawInput = screen.getByLabelText(/Raw expression/i)
      await user.click(rawInput)
      await user.paste('${result > 0}')

      await user.click(screen.getByRole('button', { name: /Add node/i }))

      expect(mockOnSubmit).toHaveBeenCalled()
      const callArgs = mockOnSubmit.mock.calls[0][0]
      expect(callArgs).toMatchObject({
        name: 'Test Condition',
        condition: '${result > 0}',
      })
    })

    it('submits without logicType field (removed from interface)', async () => {
      const user = userEvent.setup()
      renderWithHeader(<ConditionNodeForm onSubmit={mockOnSubmit} />)

      await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Another Condition')
      await user.selectOptions(screen.getByLabelText(/Expression editor mode/i), 'raw')
      const rawInput = screen.getByLabelText(/Raw expression/i)
      await user.click(rawInput)
      await user.paste('${x == 5}')
      await user.click(screen.getByRole('button', { name: /Add node/i }))

      const submittedData = mockOnSubmit.mock.calls[0][0] as ConditionFormData
      expect(submittedData).not.toHaveProperty('logicType')
      expect(submittedData.name).toBe('Another Condition')
      expect(submittedData.condition).toBe('${x == 5}')
    })
  })

  describe('Validation', () => {
    it('validates required condition field', async () => {
      const user = userEvent.setup()
      renderWithHeader(<ConditionNodeForm onSubmit={mockOnSubmit} />)

      await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'No Condition')
      await user.click(screen.getByRole('button', { name: /Add node/i }))

      // Form should not submit without condition
      expect(mockOnSubmit).not.toHaveBeenCalled()
    })
  })

  describe('Initial Data', () => {
    it('pre-populates form with initialData', () => {
      const initialData: ConditionFormData = {
        name: 'Existing Condition',
        condition: '${status == "active"}',
      }

      renderWithHeader(<ConditionNodeForm onSubmit={mockOnSubmit} initialData={initialData} />)

      expect(screen.getByPlaceholderText(/Enter activity name/i)).toHaveValue('Existing Condition')
      // Note: Expression builder field value validation would require examining the internal state
    })
  })

  describe('Header Content', () => {
    it('calls onHeaderContentChange with name field', () => {
      const mockOnHeaderContentChange = vi.fn()
      render(<ConditionNodeForm onSubmit={mockOnSubmit} onHeaderContentChange={mockOnHeaderContentChange} />)

      expect(mockOnHeaderContentChange).toHaveBeenCalledWith(expect.anything())
    })

    it('cleans up header content on unmount', () => {
      const mockOnHeaderContentChange = vi.fn()
      const { unmount } = render(
        <ConditionNodeForm onSubmit={mockOnSubmit} onHeaderContentChange={mockOnHeaderContentChange} />
      )

      mockOnHeaderContentChange.mockClear()
      unmount()

      expect(mockOnHeaderContentChange).toHaveBeenCalledWith(null)
    })
  })

  describe('Conditional Expression Help', () => {
    it('renders help icon', () => {
      renderWithHeader(<ConditionNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByRole('button', { name: /Conditional expression help/i })).toBeInTheDocument()
    })
  })
})
