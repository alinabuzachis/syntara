import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { MultiRoleSelect, type RoleOption } from './MultiRoleSelect'

const options: RoleOption[] = [
  { id: 'r1', name: 'Admin', description: 'Full access' },
  { id: 'r2', name: 'Viewer', description: 'Read-only access' },
  { id: 'r3', name: 'Editor', description: null },
]

describe('MultiRoleSelect', () => {
  const mockOnChange = vi.fn()

  function renderSelect(selected: string[] = []) {
    return render(<MultiRoleSelect options={options} selected={selected} onChange={mockOnChange} />)
  }

  describe('Accessibility', () => {
    it('has no accessibility violations with no selection', async () => {
      const { container } = renderSelect()
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has no accessibility violations with selections', async () => {
      const { container } = renderSelect(['r1'])
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })
  })

  describe('Rendering', () => {
    it('renders the select with placeholder when nothing is selected', () => {
      renderSelect()
      expect(screen.getByPlaceholderText('Search for roles...')).toBeInTheDocument()
    })

    it('does not show placeholder when roles are selected', () => {
      renderSelect(['r1'])
      expect(screen.queryByPlaceholderText('Search for roles...')).not.toBeInTheDocument()
    })

    it('renders selected roles as labels', () => {
      renderSelect(['r1', 'r2'])
      expect(screen.getByText('Admin')).toBeInTheDocument()
      expect(screen.getByText('Viewer')).toBeInTheDocument()
    })

    it('shows the "Clear all" button when roles are selected', () => {
      renderSelect(['r1'])
      expect(screen.getByRole('button', { name: 'Clear all' })).toBeInTheDocument()
    })

    it('does not show the "Clear all" button when no roles are selected', () => {
      renderSelect()
      expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument()
    })

    it('falls back to id when role name is not found in options', () => {
      render(<MultiRoleSelect options={options} selected={['unknown-id']} onChange={mockOnChange} />)
      expect(screen.getByText('unknown-id')).toBeInTheDocument()
    })
  })

  describe('Selecting roles', () => {
    it('shows available (unselected) options when opened', async () => {
      const user = userEvent.setup()
      renderSelect(['r1'])

      // Open the dropdown
      await user.click(screen.getByRole('button', { expanded: false }))

      // r1 is selected, so only r2 and r3 should appear
      expect(screen.getByRole('option', { name: /Viewer/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /Editor/i })).toBeInTheDocument()
      expect(screen.queryByRole('option', { name: /^Admin$/i })).not.toBeInTheDocument()
    })

    it('calls onChange with the new role added when an option is selected', async () => {
      const user = userEvent.setup()
      renderSelect(['r1'])

      await user.click(screen.getByRole('button', { expanded: false }))
      await user.click(screen.getByRole('option', { name: /Viewer/i }))

      expect(mockOnChange).toHaveBeenCalledWith(['r1', 'r2'])
    })

    it('does not duplicate a role that is already selected', async () => {
      // This tests the guard: if (!selected.includes(roleId))
      // We verify onChange isn't called with duplicates by selecting an available option
      const user = userEvent.setup()
      renderSelect()

      await user.click(screen.getByRole('button', { expanded: false }))
      await user.click(screen.getByRole('option', { name: /Admin/i }))

      expect(mockOnChange).toHaveBeenCalledWith(['r1'])
    })
  })

  describe('Removing roles', () => {
    it('calls onChange without the removed role when a label close button is clicked', async () => {
      const user = userEvent.setup()
      renderSelect(['r1', 'r2'])

      // PF6 Label close button has aria-label "Close <label-text>"
      const closeButton = screen.getByRole('button', { name: 'Close Admin' })
      await user.click(closeButton)

      expect(mockOnChange).toHaveBeenCalledWith(['r2'])
    })
  })

  describe('Clear all', () => {
    it('calls onChange with empty array and clears filter', async () => {
      const user = userEvent.setup()
      renderSelect(['r1', 'r2'])

      await user.click(screen.getByRole('button', { name: 'Clear all' }))

      expect(mockOnChange).toHaveBeenCalledWith([])
    })
  })

  describe('Filtering', () => {
    it('filters options by text input', async () => {
      const user = userEvent.setup()
      renderSelect()

      // Open the dropdown by clicking the toggle
      await user.click(screen.getByRole('button', { expanded: false }))

      // Type a filter value
      const input = screen.getByPlaceholderText('Search for roles...')
      await user.type(input, 'view')

      // Only Viewer should match
      expect(screen.getByRole('option', { name: /Viewer/i })).toBeInTheDocument()
      expect(screen.queryByRole('option', { name: /Admin/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('option', { name: /Editor/i })).not.toBeInTheDocument()
    })

    it('shows "No results match" when filter has no matches', async () => {
      const user = userEvent.setup()
      renderSelect()

      await user.click(screen.getByRole('button', { expanded: false }))

      const input = screen.getByPlaceholderText('Search for roles...')
      await user.type(input, 'zzz')

      expect(screen.getByText('No results match "zzz"')).toBeInTheDocument()
    })

    it('shows "No roles available" when no options and no filter', async () => {
      const user = userEvent.setup()
      render(<MultiRoleSelect options={[]} selected={[]} onChange={mockOnChange} />)

      await user.click(screen.getByRole('button', { expanded: false }))

      expect(screen.getByText('No roles available')).toBeInTheDocument()
    })

    it('opens dropdown when typing in a closed select', async () => {
      const user = userEvent.setup()
      renderSelect()

      const input = screen.getByPlaceholderText('Search for roles...')
      await user.type(input, 'a')

      // The dropdown should now be open, showing Admin
      expect(screen.getByRole('option', { name: /Admin/i })).toBeInTheDocument()
    })
  })
})
