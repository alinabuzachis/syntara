import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'

import type { FilterConfig, FilterFieldDefinition } from '../../types/filters'
import { FilterTypeEnum } from '../../types/filters'

import type { FilterBarProps } from './FilterBar'
import { FilterBar } from './FilterBar'

/**
 * Controlled FilterBar wrapper for testing
 */
function ControlledFilterBar({
  onFilterChange,
  initialFilters,
  ...props
}: Omit<FilterBarProps, 'filters' | 'onFilterChange'> & {
  onFilterChange?: (filters: FilterConfig[]) => void
  initialFilters?: FilterConfig[]
}) {
  const [filters, setFilters] = useState<FilterConfig[]>(initialFilters ?? [])

  return (
    <FilterBar
      {...props}
      filters={filters}
      onFilterChange={(newFilters) => {
        onFilterChange?.(newFilters)
        setFilters(newFilters)
      }}
    />
  )
}

describe('FilterBar', () => {
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
    operators: ['in'],
    options: [
      { label: 'Running', value: 'running' },
      { label: 'Failed', value: 'failed' },
    ],
  }

  const defaultProps = {
    fieldDefinitions: [textFieldDefinition, selectFieldDefinition],
    filters: [] as FilterConfig[],
    onFilterChange: vi.fn(),
  }

  describe('rendering', () => {
    it('renders toolbar', () => {
      const { container } = render(<FilterBar {...defaultProps} />)

      expect(container.querySelector('#filter-toolbar')).toBeInTheDocument()
    })

    it('renders attribute search field selector', () => {
      render(<FilterBar {...defaultProps} />)

      // Should render the field selector with first field selected
      expect(screen.getByText('Name')).toBeInTheDocument()
    })

    it('does not show filter chips when no filters', () => {
      render(<FilterBar {...defaultProps} />)

      // No chips or category labels should be visible
      expect(screen.queryByText('Name')).toBeInTheDocument() // Field selector shows "Name"
      expect(screen.queryByText('test')).not.toBeInTheDocument()
    })

    it('shows filter chips grouped by field name', () => {
      const filters: FilterConfig[] = [{ key: 'name', operator: 'contains', value: 'test' }]

      render(<FilterBar {...defaultProps} filters={filters} />)

      // Should show chip value
      expect(screen.getByText('test')).toBeInTheDocument()
      // Category name "Name" appears multiple times (field selector + label group)
      const nameElements = screen.getAllByText('Name')
      expect(nameElements.length).toBeGreaterThanOrEqual(1)
    })

    it('does not show clear all button when no filters', () => {
      render(<FilterBar {...defaultProps} showClearAll={true} />)

      expect(screen.queryByText('Clear all filters')).not.toBeInTheDocument()
    })

    it('shows clear all button when filters active', () => {
      const filters: FilterConfig[] = [{ key: 'name', operator: 'contains', value: 'test' }]

      render(<FilterBar {...defaultProps} filters={filters} showClearAll={true} />)

      expect(screen.getByText('Clear all filters')).toBeInTheDocument()
    })

    it('hides clear all button when showClearAll is false', () => {
      const filters: FilterConfig[] = [{ key: 'name', operator: 'contains', value: 'test' }]

      render(<FilterBar {...defaultProps} filters={filters} showClearAll={false} />)

      expect(screen.queryByText('Clear all filters')).not.toBeInTheDocument()
    })
  })

  describe('attribute search', () => {
    it('allows selecting different filter fields', async () => {
      const user = userEvent.setup()

      render(<FilterBar {...defaultProps} />)

      // Click field selector to open dropdown
      const fieldSelector = screen.getByText('Name')
      await user.click(fieldSelector)

      // Should show both field options
      expect(screen.getByText('Status')).toBeInTheDocument()
    })

    it('renders text input for TEXT field type', () => {
      render(<FilterBar {...defaultProps} />)

      // Should render text input with placeholder
      expect(screen.getByPlaceholderText('Filter by name')).toBeInTheDocument()
    })
  })

  describe('filter chips', () => {
    it('displays active filter chips grouped by field', () => {
      const filters: FilterConfig[] = [{ key: 'name', operator: 'contains', value: 'test' }]

      render(<FilterBar {...defaultProps} filters={filters} />)

      // Should show chip value "test"
      expect(screen.getByText('test')).toBeInTheDocument()
      // Category name "Name" appears in label group
      const nameElements = screen.getAllByText('Name')
      expect(nameElements.length).toBeGreaterThanOrEqual(1)
    })

    it('displays multiple filter chips with separate groups', () => {
      const filters: FilterConfig[] = [
        { key: 'name', operator: 'contains', value: 'test' },
        { key: 'status', operator: 'eq', value: 'running' },
      ]

      render(<FilterBar {...defaultProps} filters={filters} />)

      // Should show both chip values (name shows raw value, status shows label from options)
      expect(screen.getByText('test')).toBeInTheDocument()
      // "Running" appears in both the chip and the dropdown value, so use getAllByText
      const runningElements = screen.getAllByText('Running')
      expect(runningElements.length).toBeGreaterThan(0)
      // Verify at least one is in a chip
      const chipWithRunning = runningElements.find((el) => el.closest('.pf-v6-c-label'))
      expect(chipWithRunning).toBeInTheDocument()
      // Category names appear in label groups
      const nameElements = screen.getAllByText('Name')
      expect(nameElements.length).toBeGreaterThanOrEqual(1)
      const statusElements = screen.getAllByText('Status')
      expect(statusElements.length).toBeGreaterThanOrEqual(1)
    })

    it('removes filter when chip clicked', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()
      const filters: FilterConfig[] = [
        { key: 'name', operator: 'contains', value: 'test' },
        { key: 'status', operator: 'eq', value: 'running' },
      ]

      render(<FilterBar {...defaultProps} filters={filters} onFilterChange={onFilterChange} />)

      // Find the close button for the "test" chip
      const testChip = screen.getByText('test')
      const labelElement = testChip.closest('.pf-v6-c-label')
      const closeButton = labelElement?.querySelector('button')

      expect(closeButton).toBeInTheDocument()
      if (closeButton) {
        await user.click(closeButton)
      }

      // Should remove name filter, keep status filter
      expect(onFilterChange).toHaveBeenCalledWith([{ key: 'status', operator: 'eq', value: 'running' }])
    })

    it('removes date range filter with specific operator', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()
      const filters: FilterConfig[] = [
        { key: 'created_at', operator: 'gte', value: '2024-01-01' },
        { key: 'created_at', operator: 'lte', value: '2024-12-31' },
      ]

      const dateRangeFieldDefinition: FilterFieldDefinition = {
        key: 'created_at',
        label: 'Created',
        type: FilterTypeEnum.DATERANGE,
      }

      render(
        <FilterBar
          {...defaultProps}
          fieldDefinitions={[dateRangeFieldDefinition]}
          filters={filters}
          onFilterChange={onFilterChange}
        />
      )

      // Find the close button for the first chip (gte)
      const gteChip = screen.getByText('2024-01-01')
      const labelElement = gteChip.closest('.pf-v6-c-label')
      const closeButton = labelElement?.querySelector('button')

      if (closeButton) {
        await user.click(closeButton)
      }

      // Should remove only the gte filter, keep lte filter
      expect(onFilterChange).toHaveBeenCalledWith([{ key: 'created_at', operator: 'lte', value: '2024-12-31' }])
    })
  })

  describe('clear all filters', () => {
    it('clears all filters when button clicked', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()
      const filters: FilterConfig[] = [
        { key: 'name', operator: 'contains', value: 'test' },
        { key: 'status', operator: 'eq', value: 'running' },
      ]

      render(<FilterBar {...defaultProps} filters={filters} onFilterChange={onFilterChange} showClearAll={true} />)

      // Get all buttons with "Clear all filters" text
      const clearButtons = screen.getAllByRole('button', { name: /clear all filters/i })
      // Click the first one (our custom clear button)
      await user.click(clearButtons[0])

      expect(onFilterChange).toHaveBeenCalledWith([])
    })

    it('clears all active filters when clear all clicked', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()
      const initialFilters: FilterConfig[] = [
        { key: 'name', operator: 'contains', value: 'test' },
        { key: 'status', operator: 'eq', value: 'running' },
      ]

      render(
        <ControlledFilterBar
          {...defaultProps}
          initialFilters={initialFilters}
          onFilterChange={onFilterChange}
          showClearAll={true}
        />
      )

      const clearButton = screen.getByText('Clear all filters')
      await user.click(clearButton)

      // onFilterChange should be called with empty array
      expect(onFilterChange).toHaveBeenCalledWith([])
    })
  })

  describe('filter field rendering', () => {
    it('renders text filter when field type is TEXT', () => {
      const fieldDefinitions = [textFieldDefinition]

      render(<FilterBar {...defaultProps} fieldDefinitions={fieldDefinitions} />)

      // Text filter should render in attribute search
      expect(screen.getByPlaceholderText('Filter by name')).toBeInTheDocument()
    })

    it('renders select dropdown when SELECT field is selected', () => {
      const fieldDefinitions = [selectFieldDefinition]

      render(<FilterBar {...defaultProps} fieldDefinitions={fieldDefinitions} />)

      // Field selector should show first field (Status)
      expect(screen.getByText('Status')).toBeInTheDocument()
      // Should show placeholder for value selector
      expect(screen.getByText('Filter by status')).toBeInTheDocument()
    })

    it('renders boolean filter when field type is BOOLEAN', () => {
      const booleanFieldDefinition: FilterFieldDefinition = {
        key: 'is_active',
        label: 'Active',
        type: FilterTypeEnum.BOOLEAN,
      }

      render(<FilterBar {...defaultProps} fieldDefinitions={[booleanFieldDefinition]} />)

      // Should render the boolean filter toggle
      expect(screen.getByRole('switch')).toBeInTheDocument()
    })

    it('renders date range filter when field type is DATERANGE', () => {
      const dateRangeFieldDefinition: FilterFieldDefinition = {
        key: 'created_at',
        label: 'Created',
        type: FilterTypeEnum.DATERANGE,
      }

      render(<FilterBar {...defaultProps} fieldDefinitions={[dateRangeFieldDefinition]} />)

      // Should render date range inputs with aria-labels using field label
      expect(screen.getByLabelText('Created start date')).toBeInTheDocument()
      expect(screen.getByLabelText('Created end date')).toBeInTheDocument()
    })

    it('renders label filter when field type is LABELS', () => {
      const labelsFieldDefinition: FilterFieldDefinition = {
        key: 'labels',
        label: 'Labels',
        type: FilterTypeEnum.LABELS,
      }

      render(<FilterBar {...defaultProps} fieldDefinitions={[labelsFieldDefinition]} />)

      // Should render label filter input
      expect(screen.getByPlaceholderText(/key/i)).toBeInTheDocument()
    })
  })

  describe('filter integration', () => {
    it('handles text filter change via Enter key', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()

      render(<FilterBar {...defaultProps} onFilterChange={onFilterChange} />)

      const textInput = screen.getByPlaceholderText('Filter by name')
      await user.type(textInput, 'test{Enter}')

      expect(onFilterChange).toHaveBeenCalledWith([
        expect.objectContaining({ key: 'name', operator: 'contains', value: 'test' }),
      ])
    })

    it('handles select filter change', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()
      const fieldDefinitions = [selectFieldDefinition]

      render(<FilterBar {...defaultProps} fieldDefinitions={fieldDefinitions} onFilterChange={onFilterChange} />)

      // Click value selector to open dropdown
      const toggle = screen.getByText('Filter by status')
      await user.click(toggle)

      // Select an option
      const option = screen.getByText('Running')
      await user.click(option)

      expect(onFilterChange).toHaveBeenCalledWith([expect.objectContaining({ key: 'status', value: 'running' })])
    })

    it('handles boolean filter change', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()
      const booleanFieldDefinition: FilterFieldDefinition = {
        key: 'is_active',
        label: 'Active',
        type: FilterTypeEnum.BOOLEAN,
      }

      render(
        <FilterBar {...defaultProps} fieldDefinitions={[booleanFieldDefinition]} onFilterChange={onFilterChange} />
      )

      const toggleSwitch = screen.getByRole('switch')
      await user.click(toggleSwitch)

      // BooleanFilter passes filter directly via handleFilterUpdate (not in array yet)
      // handleFilterUpdate then wraps it in an array
      expect(onFilterChange).toHaveBeenCalledWith([{ key: 'is_active', operator: 'eq', value: true }])
    })

    it('handles date range filter change', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()
      const dateRangeFieldDefinition: FilterFieldDefinition = {
        key: 'created_at',
        label: 'Created',
        type: FilterTypeEnum.DATERANGE,
      }

      render(
        <FilterBar {...defaultProps} fieldDefinitions={[dateRangeFieldDefinition]} onFilterChange={onFilterChange} />
      )

      // DatePicker uses aria-label "Created start date"
      const startDateInput = screen.getByLabelText('Created start date')
      await user.type(startDateInput, '2024-01-01')

      // Date range filter calls handleDateRangeChange which replaces all filters for this field
      // The onChange from DateRangeFilter passes an array of filters (gte/lte)
      expect(onFilterChange).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ key: 'created_at', operator: 'gte' })])
      )
    })

    it('handles label filter change', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()
      const labelsFieldDefinition: FilterFieldDefinition = {
        key: 'labels',
        label: 'Labels',
        type: FilterTypeEnum.LABELS,
      }

      render(<FilterBar {...defaultProps} fieldDefinitions={[labelsFieldDefinition]} onFilterChange={onFilterChange} />)

      // LabelFilter uses specific aria-labels
      const keyInput = screen.getByLabelText('Label key 1')
      const valueInput = screen.getByLabelText('Label value 1')

      // Type both fields
      await user.type(keyInput, 'env')
      await user.type(valueInput, 'prod')

      // Label filter should have called onFilterChange multiple times (once per keystroke)
      expect(onFilterChange).toHaveBeenCalled()

      // At least one call should have a labels filter
      const callsWithLabels = onFilterChange.mock.calls.filter((call) => {
        const filters = call[0] as FilterConfig[]
        return filters.some((f) => f.key === 'labels')
      })
      expect(callsWithLabels.length).toBeGreaterThan(0)
    })
  })

  describe('edge cases', () => {
    it('handles empty field definitions', () => {
      const { container } = render(<FilterBar {...defaultProps} fieldDefinitions={[]} />)

      // Should not crash
      expect(container.querySelector('#filter-toolbar')).toBeInTheDocument()
    })

    it('handles mixed filter types', () => {
      const mixedFieldDefinitions: FilterFieldDefinition[] = [
        textFieldDefinition,
        selectFieldDefinition,
        { key: 'is_active', label: 'Active', type: FilterTypeEnum.BOOLEAN },
        { key: 'created_at', label: 'Created', type: FilterTypeEnum.DATERANGE },
      ]

      render(<FilterBar {...defaultProps} fieldDefinitions={mixedFieldDefinitions} />)

      // Should render attribute search for TEXT/SELECT
      expect(screen.getByText('Name')).toBeInTheDocument()
      // Should render boolean filter
      expect(screen.getByRole('switch')).toBeInTheDocument()
      // Should render date range filter
      expect(screen.getByLabelText('Created start date')).toBeInTheDocument()
    })

    it('updates existing filter when value changes', async () => {
      const user = userEvent.setup()
      const initialFilters: FilterConfig[] = [{ key: 'name', operator: 'contains', value: 'old' }]

      render(<ControlledFilterBar {...defaultProps} initialFilters={initialFilters} />)

      const textInput = screen.getByPlaceholderText('Filter by name')
      await user.clear(textInput)
      await user.type(textInput, 'new{Enter}')

      // Should update the existing filter, not add a new one
      expect(screen.getByText('new')).toBeInTheDocument()
      expect(screen.queryByText('old')).not.toBeInTheDocument()
    })

    it('handles date range filter removal', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()
      const dateRangeFieldDefinition: FilterFieldDefinition = {
        key: 'created_at',
        label: 'Created',
        type: FilterTypeEnum.DATERANGE,
      }
      const initialFilters: FilterConfig[] = [
        { key: 'created_at', operator: 'gte', value: '2024-01-01T00:00:00.000Z' },
        { key: 'created_at', operator: 'lte', value: '2024-12-31T23:59:59.999Z' },
      ]

      render(
        <FilterBar
          {...defaultProps}
          fieldDefinitions={[dateRangeFieldDefinition]}
          filters={initialFilters}
          onFilterChange={onFilterChange}
        />
      )

      // Find the first chip value and its close button
      const gteChip = screen.getByText('2024-01-01T00:00:00.000Z')
      const labelElement = gteChip.closest('.pf-v6-c-label')
      const closeButton = labelElement?.querySelector('button')

      if (closeButton) {
        await user.click(closeButton)
      }

      // Should call onFilterChange to remove the gte filter but keep lte
      expect(onFilterChange).toHaveBeenCalled()
    })

    it('handles label values with colons correctly', () => {
      const labelsFieldDefinition: FilterFieldDefinition = {
        key: 'labels',
        label: 'Labels',
        type: FilterTypeEnum.LABELS,
      }
      // Label value contains colons (e.g., URL)
      const initialFilters: FilterConfig[] = [{ key: 'labels', operator: 'eq', value: 'url:https://example.com:8080' }]

      render(<FilterBar {...defaultProps} fieldDefinitions={[labelsFieldDefinition]} filters={initialFilters} />)

      // ActiveFilterChips displays the full filter.value (key:value format)
      expect(screen.getByText('url:https://example.com:8080')).toBeInTheDocument()

      // LabelFilter should parse it correctly - verify the input shows the parsed value
      const valueInput = screen.getByLabelText('Label value 1')
      expect(valueInput).toHaveValue('https://example.com:8080')
    })

    it('maintains selected field after applying SELECT filter', async () => {
      const user = userEvent.setup()

      render(
        <ControlledFilterBar fieldDefinitions={[textFieldDefinition, selectFieldDefinition]} initialFilters={[]} />
      )

      // Initially shows Name field (first field)
      const allButtons = screen.getAllByRole('button')
      const fieldSelectorButton = allButtons.find(
        (btn) => btn.textContent?.includes('Name') && btn.querySelector('.pf-v6-c-menu-toggle__icon')
      )
      expect(fieldSelectorButton).toBeInTheDocument()

      // Switch to Status field
      if (fieldSelectorButton) {
        await user.click(fieldSelectorButton)
      }
      const statusOption = screen.getByText('Status')
      await user.click(statusOption)

      // Verify Status field is now selected (field selector shows Status)
      const updatedButtons = screen.getAllByRole('button')
      const statusFieldSelector = updatedButtons.find(
        (btn) => btn.textContent?.includes('Status') && btn.querySelector('.pf-v6-c-menu-toggle__icon')
      )
      expect(statusFieldSelector).toBeInTheDocument()

      // Select a value from the Status dropdown
      const statusDropdown = screen.getByRole('button', { name: /Filter by status/i })
      await user.click(statusDropdown)
      const runningOption = screen.getByText('Running')
      await user.click(runningOption)

      // CRITICAL: After applying the filter, the field selector should still show "Status", not reset to "Name"
      const finalButtons = screen.getAllByRole('button')
      const finalFieldSelector = finalButtons.find(
        (btn) => btn.textContent?.includes('Status') && btn.querySelector('.pf-v6-c-menu-toggle__icon')
      )
      expect(finalFieldSelector).toBeInTheDocument()

      // Verify the filter chip shows the label, not raw value
      // There will be multiple "Running" text elements (in dropdown and in chip), so use getAllByText
      const runningElements = screen.getAllByText('Running')
      expect(runningElements.length).toBeGreaterThan(0)

      // Verify at least one is in a label chip
      const chipWithRunning = runningElements.find((el) => el.closest('.pf-v6-c-label'))
      expect(chipWithRunning).toBeInTheDocument()
    })
  })
})
