import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

import type { FilterFieldDefinition } from '../../types/filters'
import { FilterTypeEnum } from '../../types/filters'

import { TextFilter } from './TextFilter'

describe('TextFilter', () => {
  const textFieldDefinition: FilterFieldDefinition = {
    key: 'name',
    label: 'Name',
    type: FilterTypeEnum.TEXT,
    defaultOperator: 'contains',
    placeholder: 'Filter by name',
  }

  const selectFieldDefinition: FilterFieldDefinition = {
    key: 'status',
    label: 'Status',
    type: FilterTypeEnum.SELECT,
    options: [
      { label: 'Enabled', value: 'true' },
      { label: 'Disabled', value: 'false' },
    ],
    placeholder: 'Filter by status',
  }

  const defaultProps = {
    fieldDefinitions: [textFieldDefinition, selectFieldDefinition],
    filters: [],
    onFilterChange: vi.fn(),
  }

  describe('field selector', () => {
    it('renders field selector with first field selected by default', () => {
      render(<TextFilter {...defaultProps} />)

      expect(screen.getByText('Name')).toBeInTheDocument()
    })

    it('allows switching between fields', async () => {
      const user = userEvent.setup()
      render(<TextFilter {...defaultProps} />)

      // Click field selector
      const fieldSelector = screen.getByText('Name')
      await user.click(fieldSelector)

      // Select Status field
      const statusOption = screen.getByText('Status')
      await user.click(statusOption)

      // Field selector should now show Status
      expect(screen.getByText('Filter by status')).toBeInTheDocument()
    })
  })

  describe('text field filtering', () => {
    it('renders text input for TEXT field type', () => {
      render(<TextFilter {...defaultProps} />)

      expect(screen.getByPlaceholderText('Filter by name')).toBeInTheDocument()
    })

    it('applies filter when arrow button is clicked', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()

      render(<TextFilter {...defaultProps} onFilterChange={onFilterChange} />)

      const input = screen.getByPlaceholderText('Filter by name')
      await user.type(input, 'test')

      // Filter should not be applied yet
      expect(onFilterChange).not.toHaveBeenCalled()

      // Click the arrow button
      const applyButton = screen.getByLabelText('Apply filter')
      await user.click(applyButton)

      expect(onFilterChange).toHaveBeenCalledWith({
        key: 'name',
        operator: 'contains',
        value: 'test',
      })
    })

    it('applies filter on Enter key', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()

      render(<TextFilter {...defaultProps} onFilterChange={onFilterChange} />)

      const input = screen.getByPlaceholderText('Filter by name')
      await user.type(input, 'test{Enter}')

      expect(onFilterChange).toHaveBeenCalledWith({
        key: 'name',
        operator: 'contains',
        value: 'test',
      })
    })

    it('displays active filter value in input', () => {
      const filters = [{ key: 'name', operator: 'contains' as const, value: 'existing-filter' }]

      render(<TextFilter {...defaultProps} filters={filters} />)

      expect(screen.getByDisplayValue('existing-filter')).toBeInTheDocument()
    })

    it('allows editing active filter value', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()
      const filters = [{ key: 'name', operator: 'contains' as const, value: 'original' }]

      render(<TextFilter {...defaultProps} filters={filters} onFilterChange={onFilterChange} />)

      const input = screen.getByDisplayValue('original')
      await user.clear(input)
      await user.type(input, 'modified{Enter}')

      expect(onFilterChange).toHaveBeenCalledWith({
        key: 'name',
        operator: 'contains',
        value: 'modified',
      })
    })

    it('clears filter when input is emptied and Enter pressed', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()
      const filters = [{ key: 'name', operator: 'contains' as const, value: 'test' }]

      render(<TextFilter {...defaultProps} filters={filters} onFilterChange={onFilterChange} />)

      const input = screen.getByDisplayValue('test')
      await user.clear(input)
      await user.type(input, '{Enter}')

      expect(onFilterChange).toHaveBeenCalledWith(null, 'name')
    })
  })

  describe('select field filtering', () => {
    it('renders select dropdown for SELECT field type', () => {
      const fieldDefinitions = [selectFieldDefinition]

      render(<TextFilter {...defaultProps} fieldDefinitions={fieldDefinitions} />)

      // Field selector shows Status
      expect(screen.getByText('Status')).toBeInTheDocument()
      // Value selector shows placeholder
      expect(screen.getByText('Filter by status')).toBeInTheDocument()
    })

    it('applies filter when option is selected', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()
      const fieldDefinitions = [selectFieldDefinition]

      render(<TextFilter {...defaultProps} fieldDefinitions={fieldDefinitions} onFilterChange={onFilterChange} />)

      // Click value selector
      const valueSelector = screen.getByText('Filter by status')
      await user.click(valueSelector)

      // Select an option
      const enabledOption = screen.getByText('Enabled')
      await user.click(enabledOption)

      expect(onFilterChange).toHaveBeenCalledWith({
        key: 'status',
        operator: 'eq',
        value: 'true',
      })
    })

    it('displays active filter value in selector', () => {
      const fieldDefinitions = [selectFieldDefinition]
      const filters = [{ key: 'status', operator: 'eq' as const, value: 'true' }]

      render(<TextFilter {...defaultProps} fieldDefinitions={fieldDefinitions} filters={filters} />)

      // Value selector should show the selected option label
      expect(screen.getByText('Enabled')).toBeInTheDocument()
    })
  })

  describe('field switching behavior', () => {
    it('clears input when switching fields', async () => {
      const user = userEvent.setup()

      render(<TextFilter {...defaultProps} />)

      // Type into Name field
      const input = screen.getByPlaceholderText('Filter by name')
      await user.type(input, 'test')

      // Switch to Status field
      const fieldSelector = screen.getByText('Name')
      await user.click(fieldSelector)
      const statusOption = screen.getByText('Status')
      await user.click(statusOption)

      // Should show status selector, not the typed text
      expect(screen.getByText('Filter by status')).toBeInTheDocument()
      expect(screen.queryByDisplayValue('test')).not.toBeInTheDocument()
    })

    it('selects field based on last filter in filters array', () => {
      // With status filter as the last filter
      const filters = [
        { key: 'name', operator: 'contains' as const, value: 'test' },
        { key: 'status', operator: 'eq' as const, value: 'true' },
      ]

      render(<TextFilter {...defaultProps} filters={filters} />)

      // Should select Status field (last filter)
      const allButtons = screen.getAllByRole('button')
      const statusFieldSelector = allButtons.find(
        (btn) => btn.textContent?.includes('Status') && btn.querySelector('.pf-v6-c-menu-toggle__icon')
      )
      expect(statusFieldSelector).toBeInTheDocument()
    })

    it('defaults to first field when no filters present', () => {
      render(<TextFilter {...defaultProps} filters={[]} />)

      // Should default to Name (first field)
      expect(screen.getByText('Name')).toBeInTheDocument()
    })
  })

  describe('multiselect filter', () => {
    const multiselectFieldDefinition: FilterFieldDefinition = {
      key: 'tags',
      label: 'Tags',
      type: FilterTypeEnum.MULTISELECT,
      options: [
        { label: 'Production', value: 'prod' },
        { label: 'Staging', value: 'staging' },
        { label: 'Development', value: 'dev' },
      ],
      placeholder: 'Select tags',
    }

    const multiselectProps = {
      fieldDefinitions: [multiselectFieldDefinition],
      filters: [],
      onFilterChange: vi.fn(),
    }

    it('renders multiselect toggle with placeholder', () => {
      render(<TextFilter {...multiselectProps} />)
      expect(screen.getByText('Select tags')).toBeInTheDocument()
    })

    it('shows options when multiselect is opened', async () => {
      const user = userEvent.setup()
      render(<TextFilter {...multiselectProps} />)

      await user.click(screen.getByText('Select tags'))

      expect(screen.getByText('Production')).toBeInTheDocument()
      expect(screen.getByText('Staging')).toBeInTheDocument()
      expect(screen.getByText('Development')).toBeInTheDocument()
    })

    it('selects an option from multiselect', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()
      render(<TextFilter {...multiselectProps} onFilterChange={onFilterChange} />)

      await user.click(screen.getByText('Select tags'))
      await user.click(screen.getByText('Production'))

      expect(onFilterChange).toHaveBeenCalledTimes(1)
    })

    it('shows selected count when filters are present', () => {
      const filters = [{ key: 'tags', operator: 'in' as const, value: ['prod'] }]
      render(<TextFilter {...multiselectProps} filters={filters} />)

      expect(screen.getByText('1 selected')).toBeInTheDocument()
    })
  })

  describe('select filter close behavior', () => {
    it('clears search when select is closed', async () => {
      const user = userEvent.setup()
      render(<TextFilter {...defaultProps} />)

      const fieldSelector = screen.getByText('Name')
      await user.click(fieldSelector)
      await user.click(screen.getByText('Status'))

      const statusToggle = screen.getByText('Filter by status')
      await user.click(statusToggle)
      expect(screen.getByText('Enabled')).toBeInTheDocument()

      await user.click(statusToggle)

      await waitFor(() => {
        expect(screen.queryByText('Enabled')).not.toBeInTheDocument()
      })
    })
  })
})
