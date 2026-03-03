import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApprovalNodeForm } from './ApprovalNodeForm'
import { renderWithHeader } from './test-utils/renderWithHeader'

describe('ApprovalNodeForm', () => {
  const mockOnSubmit = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('renders all required fields', () => {
      renderWithHeader(<ApprovalNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByText(/Usernames to notify/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Message/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Second\(s\)/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Minute\(s\)/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Hour\(s\)/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Day\(s\)/i)).toBeInTheDocument()
    })

    it('displays timeout section title', () => {
      renderWithHeader(<ApprovalNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByText(/Timeout after time interval:/i)).toBeInTheDocument()
    })

    it('displays helper text for approvers field', () => {
      renderWithHeader(<ApprovalNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByText(/Type a username and press Enter or comma to add/i)).toBeInTheDocument()
    })

    it('displays default submit button text', () => {
      renderWithHeader(<ApprovalNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByRole('button', { name: /Add node/i })).toBeInTheDocument()
    })

    it('displays custom submit button text when provided', () => {
      renderWithHeader(<ApprovalNodeForm onSubmit={mockOnSubmit} submitButtonText="Update approval" />)

      expect(screen.getByRole('button', { name: /Update approval/i })).toBeInTheDocument()
    })
  })

  describe('Approvers Management', () => {
    it('adds approver on Enter key', async () => {
      const user = userEvent.setup()
      renderWithHeader(<ApprovalNodeForm onSubmit={mockOnSubmit} />)

      const input = screen.getByLabelText('Add approver')
      await user.type(input, 'user1{Enter}')

      expect(screen.getByText('user1')).toBeInTheDocument()
      expect(input).toHaveValue('')
    })

    it('adds approver on comma key', async () => {
      const user = userEvent.setup()
      renderWithHeader(<ApprovalNodeForm onSubmit={mockOnSubmit} />)

      const input = screen.getByLabelText('Add approver')
      await user.type(input, 'user1,')

      expect(screen.getByText('user1')).toBeInTheDocument()
      expect(input).toHaveValue('')
    })

    it('adds multiple approvers', async () => {
      const user = userEvent.setup()
      renderWithHeader(<ApprovalNodeForm onSubmit={mockOnSubmit} />)

      const input = screen.getByLabelText('Add approver')
      await user.type(input, 'user1{Enter}')
      await user.type(input, 'user2{Enter}')
      await user.type(input, 'user3{Enter}')

      expect(screen.getByText('user1')).toBeInTheDocument()
      expect(screen.getByText('user2')).toBeInTheDocument()
      expect(screen.getByText('user3')).toBeInTheDocument()
    })

    it('removes approver on close button click', async () => {
      const user = userEvent.setup()
      renderWithHeader(<ApprovalNodeForm onSubmit={mockOnSubmit} />)

      const input = screen.getByLabelText('Add approver')
      await user.type(input, 'user1{Enter}')
      expect(screen.getByText('user1')).toBeInTheDocument()

      const removeButton = screen.getByLabelText('Remove user1')
      await user.click(removeButton)

      expect(screen.queryByText('user1')).not.toBeInTheDocument()
    })

    it('does not add duplicate approvers', async () => {
      const user = userEvent.setup()
      renderWithHeader(<ApprovalNodeForm onSubmit={mockOnSubmit} />)

      const input = screen.getByLabelText('Add approver')
      await user.type(input, 'user1{Enter}')
      await user.type(input, 'user1{Enter}')

      const labels = screen.getAllByText('user1')
      expect(labels).toHaveLength(1)
    })

    it('trims whitespace from approvers', async () => {
      const user = userEvent.setup()
      renderWithHeader(<ApprovalNodeForm onSubmit={mockOnSubmit} />)

      const input = screen.getByLabelText('Add approver')
      await user.type(input, '  user1  {Enter}')

      expect(screen.getByText('user1')).toBeInTheDocument()
    })

    it('does not add empty approvers', async () => {
      const user = userEvent.setup()
      renderWithHeader(<ApprovalNodeForm onSubmit={mockOnSubmit} />)

      const input = screen.getByLabelText('Add approver')
      await user.type(input, '   {Enter}')

      expect(screen.queryByRole('button', { name: /Remove/i })).not.toBeInTheDocument()
    })
  })

  describe('Timeout Configuration', () => {
    it('converts time units to total seconds correctly', async () => {
      const user = userEvent.setup()
      renderWithHeader(<ApprovalNodeForm onSubmit={mockOnSubmit} />)

      const approverInput = screen.getByLabelText('Add approver')
      await user.type(approverInput, 'user1{Enter}')
      await user.type(screen.getByLabelText(/Message/i), 'Approve')

      // Clear default day value and set hours
      await user.clear(screen.getByLabelText(/Day\(s\)/i))
      await user.type(screen.getByLabelText(/Hour\(s\)/i), '3')

      await user.click(screen.getByRole('button', { name: /Add node/i }))

      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 10800, // 3 hours = 3 * 3600
        })
      )
    })

    it('handles only days', async () => {
      const user = userEvent.setup()
      renderWithHeader(<ApprovalNodeForm onSubmit={mockOnSubmit} />)

      const approverInput = screen.getByLabelText('Add approver')
      await user.type(approverInput, 'user1{Enter}')
      await user.type(screen.getByLabelText(/Message/i), 'Approve')

      // Clear default and set to 5 days
      await user.clear(screen.getByLabelText(/Day\(s\)/i))
      await user.type(screen.getByLabelText(/Day\(s\)/i), '5')

      await user.click(screen.getByRole('button', { name: /Add node/i }))

      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 432000, // 5 days = 5 * 86400
        })
      )
    })

    it('handles only minutes', async () => {
      const user = userEvent.setup()
      renderWithHeader(<ApprovalNodeForm onSubmit={mockOnSubmit} />)

      const approverInput = screen.getByLabelText('Add approver')
      await user.type(approverInput, 'user1{Enter}')
      await user.type(screen.getByLabelText(/Message/i), 'Approve')

      // Clear default day value and set minutes
      await user.clear(screen.getByLabelText(/Day\(s\)/i))
      await user.type(screen.getByLabelText(/Minute\(s\)/i), '30')

      await user.click(screen.getByRole('button', { name: /Add node/i }))

      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 1800, // 30 minutes = 30 * 60
        })
      )
    })

    it('handles only seconds', async () => {
      const user = userEvent.setup()
      renderWithHeader(<ApprovalNodeForm onSubmit={mockOnSubmit} />)

      const approverInput = screen.getByLabelText('Add approver')
      await user.type(approverInput, 'user1{Enter}')
      await user.type(screen.getByLabelText(/Message/i), 'Approve')

      // Clear default day value and set seconds
      await user.clear(screen.getByLabelText(/Day\(s\)/i))
      await user.type(screen.getByLabelText(/Second\(s\)/i), '45')

      await user.click(screen.getByRole('button', { name: /Add node/i }))

      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 45,
        })
      )
    })

    it('excludes timeout when all time fields are empty', async () => {
      const user = userEvent.setup()
      renderWithHeader(<ApprovalNodeForm onSubmit={mockOnSubmit} />)

      const approverInput = screen.getByLabelText('Add approver')
      await user.type(approverInput, 'user1{Enter}')
      await user.type(screen.getByLabelText(/Message/i), 'Approve')

      // Clear default day value
      await user.clear(screen.getByLabelText(/Day\(s\)/i))

      await user.click(screen.getByRole('button', { name: /Add node/i }))

      expect(mockOnSubmit).toHaveBeenCalledWith({
        name: '',
        approvers: ['user1'],
        prompt: 'Approve',
        timeout: undefined,
        onTimeout: undefined,
      })
    })

    it('excludes timeout when all time fields are zero', async () => {
      const user = userEvent.setup()
      renderWithHeader(<ApprovalNodeForm onSubmit={mockOnSubmit} />)

      const approverInput = screen.getByLabelText('Add approver')
      await user.type(approverInput, 'user1{Enter}')
      await user.type(screen.getByLabelText(/Message/i), 'Approve')

      // Clear default day value and set all to 0
      await user.clear(screen.getByLabelText(/Day\(s\)/i))
      await user.type(screen.getByLabelText(/Day\(s\)/i), '0')
      await user.type(screen.getByLabelText(/Hour\(s\)/i), '0')
      await user.type(screen.getByLabelText(/Minute\(s\)/i), '0')
      await user.type(screen.getByLabelText(/Second\(s\)/i), '0')

      await user.click(screen.getByRole('button', { name: /Add node/i }))

      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: undefined,
          onTimeout: undefined,
        })
      )
    })
  })

  describe('Form Submission', () => {
    it('submits with minimal valid data', async () => {
      const user = userEvent.setup()
      renderWithHeader(<ApprovalNodeForm onSubmit={mockOnSubmit} />)

      const approverInput = screen.getByLabelText('Add approver')
      await user.type(approverInput, 'user1{Enter}')

      const promptInput = screen.getByLabelText(/Message/i)
      await user.type(promptInput, 'Please approve')

      // Clear default timeout values
      await user.clear(screen.getByLabelText(/Day\(s\)/i))

      await user.click(screen.getByRole('button', { name: /Add node/i }))

      expect(mockOnSubmit).toHaveBeenCalledWith({
        name: '',
        approvers: ['user1'],
        prompt: 'Please approve',
        timeout: undefined,
        onTimeout: undefined,
      })
    })

    it('submits with empty message field', async () => {
      const user = userEvent.setup()
      renderWithHeader(<ApprovalNodeForm onSubmit={mockOnSubmit} />)

      const approverInput = screen.getByLabelText('Add approver')
      await user.type(approverInput, 'user1{Enter}')

      // Clear default timeout values
      await user.clear(screen.getByLabelText(/Day\(s\)/i))

      await user.click(screen.getByRole('button', { name: /Add node/i }))

      expect(mockOnSubmit).toHaveBeenCalledWith({
        name: '',
        approvers: ['user1'],
        prompt: '',
        timeout: undefined,
        onTimeout: undefined,
      })
    })

    it('submits with all fields populated', async () => {
      const user = userEvent.setup()
      renderWithHeader(<ApprovalNodeForm onSubmit={mockOnSubmit} />)

      const approverInput = screen.getByLabelText('Add approver')
      await user.type(approverInput, 'user1{Enter}')
      await user.type(approverInput, 'user2{Enter}')

      const promptInput = screen.getByLabelText(/Message/i)
      await user.type(promptInput, 'Please approve this deployment')

      // Clear default day value and set new values
      await user.clear(screen.getByLabelText(/Day\(s\)/i))
      await user.type(screen.getByLabelText(/Day\(s\)/i), '1')
      await user.type(screen.getByLabelText(/Hour\(s\)/i), '2')
      await user.type(screen.getByLabelText(/Minute\(s\)/i), '15')
      await user.type(screen.getByLabelText(/Second\(s\)/i), '30')

      await user.click(screen.getByRole('button', { name: /Add node/i }))

      expect(mockOnSubmit).toHaveBeenCalledWith({
        name: '',
        approvers: ['user1', 'user2'],
        prompt: 'Please approve this deployment',
        timeout: 94530, // 1 day + 2 hours + 15 minutes + 30 seconds = 86400 + 7200 + 900 + 30
        onTimeout: 'fail',
      })
    })

    it('trims approvers and prompt on submission', async () => {
      const user = userEvent.setup()
      renderWithHeader(<ApprovalNodeForm onSubmit={mockOnSubmit} />)

      const approverInput = screen.getByLabelText('Add approver')
      await user.type(approverInput, '  user1  {Enter}')
      await user.type(screen.getByLabelText(/Message/i), '  Please approve  ')

      await user.click(screen.getByRole('button', { name: /Add node/i }))

      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          approvers: ['user1'],
          prompt: 'Please approve',
        })
      )
    })
  })

  describe('Initial Data', () => {
    it('populates form with initial data', () => {
      renderWithHeader(
        <ApprovalNodeForm
          onSubmit={mockOnSubmit}
          initialData={{
            name: 'Approval Step',
            approvers: ['admin', 'manager'],
            prompt: 'Approve production deployment',
            timeout: 3600,
            onTimeout: 'fail',
          }}
        />
      )

      expect(screen.getByText('admin')).toBeInTheDocument()
      expect(screen.getByText('manager')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Approve production deployment')).toBeInTheDocument()
      expect(screen.getByLabelText(/Hour\(s\)/i)).toHaveValue(1)
    })

    it('converts timeout seconds to time units correctly', () => {
      renderWithHeader(
        <ApprovalNodeForm
          onSubmit={mockOnSubmit}
          initialData={{
            name: 'Test',
            approvers: ['user1'],
            prompt: 'Test',
            timeout: 93784, // 1 day + 2 hours + 3 minutes + 4 seconds
            onTimeout: 'approve',
          }}
        />
      )

      expect(screen.getByLabelText(/Day\(s\)/i)).toHaveValue(1)
      expect(screen.getByLabelText(/Hour\(s\)/i)).toHaveValue(2)
      expect(screen.getByLabelText(/Minute\(s\)/i)).toHaveValue(3)
      expect(screen.getByLabelText(/Second\(s\)/i)).toHaveValue(4)
    })

    it('defaults to 1 day timeout when no initial timeout provided', () => {
      renderWithHeader(
        <ApprovalNodeForm
          onSubmit={mockOnSubmit}
          initialData={{
            name: 'Test',
            approvers: ['user1'],
            prompt: 'Test',
          }}
        />
      )

      expect(screen.getByLabelText(/Day\(s\)/i)).toHaveValue(1)
      expect(screen.getByLabelText(/Hour\(s\)/i)).toHaveValue(0)
      expect(screen.getByLabelText(/Minute\(s\)/i)).toHaveValue(0)
      expect(screen.getByLabelText(/Second\(s\)/i)).toHaveValue(0)
    })
  })
})
