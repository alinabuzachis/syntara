import { fireEvent, screen, waitFor } from '@testing-library/react'
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

      fireEvent.submit(screen.getByTestId('approval-node-form'))

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          name: '',
          approvers: ['user1'],
          prompt: 'Please approve',
          timeout: undefined,
          onTimeout: undefined,
        })
      })
    })

    it('submits with empty message field', async () => {
      const user = userEvent.setup()
      renderWithHeader(<ApprovalNodeForm onSubmit={mockOnSubmit} />)

      const approverInput = screen.getByLabelText('Add approver')
      await user.type(approverInput, 'user1{Enter}')

      // Clear default timeout values
      await user.clear(screen.getByLabelText(/Day\(s\)/i))

      fireEvent.submit(screen.getByTestId('approval-node-form'))

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          name: '',
          approvers: ['user1'],
          prompt: '',
          timeout: undefined,
          onTimeout: undefined,
        })
      })
    })

    it('submits with all fields populated', async () => {
      const user = userEvent.setup()
      renderWithHeader(<ApprovalNodeForm onSubmit={mockOnSubmit} />)

      const approverInput = screen.getByLabelText('Add approver')
      await user.type(approverInput, 'user1{Enter}')
      await user.type(approverInput, 'user2{Enter}')

      const promptInput = screen.getByLabelText(/Message/i)
      await user.type(promptInput, 'Please review and approve')

      await user.clear(screen.getByLabelText(/Day\(s\)/i))
      await user.type(screen.getByLabelText(/Day\(s\)/i), '1')
      await user.type(screen.getByLabelText(/Hour\(s\)/i), '2')
      await user.type(screen.getByLabelText(/Minute\(s\)/i), '15')
      await user.type(screen.getByLabelText(/Second\(s\)/i), '30')

      fireEvent.submit(screen.getByTestId('approval-node-form'))

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          name: '',
          approvers: ['user1', 'user2'],
          prompt: 'Please review and approve',
          timeout: 94530, // 1 day + 2 hours + 15 minutes + 30 seconds
          onTimeout: 'fail',
        })
      })
    })

    it('trims approvers and prompt on submission', async () => {
      const user = userEvent.setup()
      renderWithHeader(<ApprovalNodeForm onSubmit={mockOnSubmit} />)

      const approverInput = screen.getByLabelText('Add approver')
      await user.type(approverInput, '  user1  {Enter}')

      const promptInput = screen.getByLabelText(/Message/i)
      await user.type(promptInput, '  Please approve  ')

      await user.clear(screen.getByLabelText(/Day\(s\)/i))

      fireEvent.submit(screen.getByTestId('approval-node-form'))

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          name: '',
          approvers: ['user1'],
          prompt: 'Please approve',
          timeout: undefined,
          onTimeout: undefined,
        })
      })
    })
  })
})
