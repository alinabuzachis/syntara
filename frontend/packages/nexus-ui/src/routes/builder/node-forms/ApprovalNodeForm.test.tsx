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
    })

    it('does not render a timeout section in parameters', () => {
      renderWithHeader(<ApprovalNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.queryByText(/Approver timeout/i)).not.toBeInTheDocument()
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
          }}
        />
      )

      expect(screen.getByText('admin')).toBeInTheDocument()
      expect(screen.getByText('manager')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Approve production deployment')).toBeInTheDocument()
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

      fireEvent.submit(screen.getByTestId('approval-node-form'))

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            name: '',
            approvers: ['user1'],
            prompt: 'Please approve',
          })
        )
      })
    })

    it('submits with empty message field', async () => {
      const user = userEvent.setup()
      renderWithHeader(<ApprovalNodeForm onSubmit={mockOnSubmit} />)

      const approverInput = screen.getByLabelText('Add approver')
      await user.type(approverInput, 'user1{Enter}')

      fireEvent.submit(screen.getByTestId('approval-node-form'))

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            name: '',
            approvers: ['user1'],
            prompt: '',
          })
        )
      })
    })

    it('trims approvers and prompt on submission', async () => {
      const user = userEvent.setup()
      renderWithHeader(<ApprovalNodeForm onSubmit={mockOnSubmit} />)

      const approverInput = screen.getByLabelText('Add approver')
      await user.type(approverInput, '  user1  {Enter}')

      const promptInput = screen.getByLabelText(/Message/i)
      await user.type(promptInput, '  Please approve  ')

      fireEvent.submit(screen.getByTestId('approval-node-form'))

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            name: '',
            approvers: ['user1'],
            prompt: 'Please approve',
          })
        )
      })
    })
  })
})
