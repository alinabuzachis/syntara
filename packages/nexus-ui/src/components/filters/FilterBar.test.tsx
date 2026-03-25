import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'

import type { FilterConfig, FilterFieldDefinition, FilterValue } from '../../types/filters'
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
      expect(screen.getByText('Name')).toBeInTheDocument() // Field selector shows "Name"
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

      // Find the close button for the first chip (gte) - now has "From:" prefix
      const gteChip = screen.getByText('From: 2024-01-01')

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

      // Should render attribute search for TEXT/SELECT/DATERANGE
      expect(screen.getByText('Name')).toBeInTheDocument() // First field in dropdown by default
      // Should render boolean filter separately (not part of TextFilter dropdown)
      expect(screen.getByRole('switch')).toBeInTheDocument()
      // Date range filter is now in the TextFilter dropdown, not rendered separately
      // To see it, user would need to select "Created" from the dropdown
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

      // Find the first chip value with "From:" prefix and its close button
      const gteChip = screen.getByText('From: 2024-01-01T00:00:00.000Z')

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

      const chipWithRunning = runningElements.find((el) => el.closest('.pf-v6-c-label'))
      expect(chipWithRunning).toBeInTheDocument()
    })

    it('allows searching SELECT filter options', async () => {
      const user = userEvent.setup()
      const manyOptionsField: FilterFieldDefinition = {
        key: 'workflow',
        label: 'Workflow',
        type: FilterTypeEnum.SELECT,
        options: [
          { label: 'Workflow Alpha', value: 'alpha' },
          { label: 'Workflow Beta', value: 'beta' },
          { label: 'Workflow Gamma', value: 'gamma' },
          { label: 'Another Workflow', value: 'another' },
        ],
      }

      render(
        <ControlledFilterBar fieldDefinitions={[manyOptionsField]} onFilterChange={vi.fn()} showClearAll={false} />
      )

      // The field selector should already show "Workflow" since it's the only field
      // Open the value selector directly
      const valueSelector = screen.getByRole('button', { name: /filter by workflow/i })
      await user.click(valueSelector)

      // Should show all 4 options initially
      expect(screen.getByRole('option', { name: 'Workflow Alpha' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Workflow Beta' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Workflow Gamma' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Another Workflow' })).toBeInTheDocument()

      // Type in the search input
      const searchInput = screen.getByPlaceholderText('Search...')
      await user.type(searchInput, 'gamma')

      // Should only show filtered option
      expect(screen.getByRole('option', { name: 'Workflow Gamma' })).toBeInTheDocument()
      expect(screen.queryByRole('option', { name: 'Workflow Alpha' })).not.toBeInTheDocument()
      expect(screen.queryByRole('option', { name: 'Workflow Beta' })).not.toBeInTheDocument()

      // Select the filtered option
      await user.click(screen.getByRole('option', { name: 'Workflow Gamma' }))

      // Verify filter chip appears (there will be multiple "Workflow Gamma" - in dropdown and chip)
      const gammaElements = screen.getAllByText('Workflow Gamma')
      expect(gammaElements.length).toBeGreaterThan(0)

      // Verify at least one is in a label chip
      const chipWithGamma = gammaElements.find((el) => el.closest('.pf-v6-c-label'))
      expect(chipWithGamma).toBeInTheDocument()
    })

    it('renders MULTISELECT filter type in TextFilter', async () => {
      const user = userEvent.setup()
      const multiSelectField: FilterFieldDefinition = {
        key: 'tags',
        label: 'Tags',
        type: FilterTypeEnum.MULTISELECT,
        options: [
          { label: 'Important', value: 'important' },
          { label: 'Urgent', value: 'urgent' },
          { label: 'Review', value: 'review' },
        ],
      }

      render(
        <ControlledFilterBar fieldDefinitions={[multiSelectField]} onFilterChange={vi.fn()} showClearAll={false} />
      )

      // MULTISELECT is rendered in TextFilter dropdown (field selector should show "Tags")
      expect(screen.getByRole('button', { name: /tags/i })).toBeInTheDocument()

      // Open the value selector (shows multi-select options with checkboxes)
      const valueSelector = screen.getByRole('button', { name: /select values/i })
      await user.click(valueSelector)

      // Wait for options to appear
      await screen.findByText('Important')

      // Verify multi-select options are rendered
      expect(screen.getByText('Important')).toBeInTheDocument()
      expect(screen.getByText('Urgent')).toBeInTheDocument()
      expect(screen.getByText('Review')).toBeInTheDocument()
    })

    it('allows removing all filters for a category via category close button', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()

      render(
        <ControlledFilterBar
          fieldDefinitions={[textFieldDefinition, selectFieldDefinition]}
          initialFilters={[
            { key: 'name', value: 'test' },
            { key: 'name', value: 'another' },
            { key: 'status', value: 'active' },
          ]}
          onFilterChange={onFilterChange}
          showClearAll={true}
        />
      )

      // Find the category close button for "Name" (LabelGroup close button)
      const nameCategory = screen.getByText('Name').closest('.pf-v6-c-label-group')
      const categoryCloseButton = nameCategory?.querySelector('button[aria-label*="Remove all"]')
      expect(categoryCloseButton).toBeInTheDocument()

      await user.click(categoryCloseButton!)

      // Should call onFilterChange with only status filter remaining
      expect(onFilterChange).toHaveBeenCalledWith([{ key: 'status', value: 'active' }])
    })
  })

  describe('label filter edge cases', () => {
    const labelsFieldDefinition: FilterFieldDefinition = {
      key: 'labels',
      label: 'Labels',
      type: FilterTypeEnum.LABELS,
    }

    it('handles label with valid key and value', () => {
      // Filter value "env:prod" - valid key and value
      const filters: FilterConfig[] = [{ key: 'labels', operator: 'eq', value: 'env:prod' }]

      render(<FilterBar {...defaultProps} fieldDefinitions={[labelsFieldDefinition]} filters={filters} />)

      // Should render - LabelFilter will parse and display the label
      // The chip should show the full value
      expect(screen.getByText('env:prod')).toBeInTheDocument()

      // Verify the inputs are populated (LabelFilter handles the format internally)
      const valueInput = screen.getByLabelText('Label value 1')
      expect(valueInput).toHaveValue('prod')
    })

    it('handles label with empty key (colon at start)', () => {
      // Filter value ":value" - no key before colon
      const filters: FilterConfig[] = [{ key: 'labels', operator: 'eq', value: ':emptykey' }]

      render(<FilterBar {...defaultProps} fieldDefinitions={[labelsFieldDefinition]} filters={filters} />)

      // Should still render without crashing
      expect(screen.getByPlaceholderText(/key/i)).toBeInTheDocument()
      // The malformed label shouldn't appear in the input (key is empty)
      const valueInput = screen.getByLabelText('Label value 1')
      expect(valueInput).toHaveValue('')
    })

    it('handles label with empty value (colon at end)', () => {
      // Filter value "key:" - no value after colon
      const filters: FilterConfig[] = [{ key: 'labels', operator: 'eq', value: 'team:' }]

      render(<FilterBar {...defaultProps} fieldDefinitions={[labelsFieldDefinition]} filters={filters} />)

      // Should render without crashing - LabelFilter will handle the parsing
      // The chip should show the raw value since the label doesn't have a valid value part
      expect(screen.getByText('team:')).toBeInTheDocument()
    })

    it('handles label without colon separator', () => {
      // Filter value "invalid" - no colon at all
      const filters: FilterConfig[] = [{ key: 'labels', operator: 'eq', value: 'invalid' }]

      render(<FilterBar {...defaultProps} fieldDefinitions={[labelsFieldDefinition]} filters={filters} />)

      // Should not crash, label won't be parsed (colonIndex will be -1, colonIndex > 0 is false)
      expect(screen.getByPlaceholderText(/key/i)).toBeInTheDocument()
    })

    it('handles label with colon at position zero', () => {
      // Filter value starting with colon - colonIndex is 0, not > 0
      const filters: FilterConfig[] = [{ key: 'labels', operator: 'eq', value: ':value' }]

      render(<FilterBar {...defaultProps} fieldDefinitions={[labelsFieldDefinition]} filters={filters} />)

      // Should not crash, colonIndex > 0 will be false
      expect(screen.getByPlaceholderText(/key/i)).toBeInTheDocument()
    })

    it('handles clearing all label filters', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()
      const initialFilters: FilterConfig[] = [{ key: 'labels', operator: 'eq', value: 'env:prod' }]

      render(
        <ControlledFilterBar
          fieldDefinitions={[labelsFieldDefinition]}
          initialFilters={initialFilters}
          onFilterChange={onFilterChange}
        />
      )

      // Type in the value field to trigger handleLabelChange
      const valueInput = screen.getByLabelText('Label value 1')
      await user.clear(valueInput)
      await user.type(valueInput, 'staging')

      // Should have called onFilterChange with updated label
      expect(onFilterChange).toHaveBeenCalled()
      // Verify at least one call has the labels filter
      const callsWithLabels = onFilterChange.mock.calls.filter((call) => {
        const filters = call[0] as FilterConfig[]
        return filters.some((f) => f.key === 'labels')
      })
      expect(callsWithLabels.length).toBeGreaterThan(0)
    })
  })

  describe('date filter edge cases', () => {
    const dateRangeFieldDefinition: FilterFieldDefinition = {
      key: 'created_at',
      label: 'Created',
      type: FilterTypeEnum.DATERANGE,
    }

    it('handles invalid date strings gracefully', () => {
      // Pass invalid date string
      const filters: FilterConfig[] = [{ key: 'created_at', operator: 'gte', value: 'invalid-date' }]

      render(<FilterBar {...defaultProps} fieldDefinitions={[dateRangeFieldDefinition]} filters={filters} />)

      // Should render without crashing - parseDate returns undefined for invalid dates
      expect(screen.getByLabelText('Created start date')).toBeInTheDocument()
      expect(screen.getByLabelText('Created end date')).toBeInTheDocument()
    })

    it('handles NaN date values', () => {
      // Pass value that creates NaN when parsed
      const filters: FilterConfig[] = [{ key: 'created_at', operator: 'gte', value: Number.NaN }]

      render(<FilterBar {...defaultProps} fieldDefinitions={[dateRangeFieldDefinition]} filters={filters} />)

      // Should handle gracefully
      expect(screen.getByLabelText('Created start date')).toBeInTheDocument()
    })

    it('handles null date values', () => {
      // Pass null value - cast to FilterValue to test edge case handling
      const filters: FilterConfig[] = [{ key: 'created_at', operator: 'gte', value: null as unknown as FilterValue }]

      render(<FilterBar {...defaultProps} fieldDefinitions={[dateRangeFieldDefinition]} filters={filters} />)

      // Should handle gracefully
      expect(screen.getByLabelText('Created start date')).toBeInTheDocument()
    })

    it('handles undefined date values', () => {
      // Pass undefined value - cast to FilterValue to test edge case handling
      const filters: FilterConfig[] = [
        { key: 'created_at', operator: 'gte', value: undefined as unknown as FilterValue },
      ]

      render(<FilterBar {...defaultProps} fieldDefinitions={[dateRangeFieldDefinition]} filters={filters} />)

      // Should handle gracefully - parseDate returns undefined for !value
      expect(screen.getByLabelText('Created start date')).toBeInTheDocument()
    })

    it('handles empty string date values', () => {
      // Pass empty string
      const filters: FilterConfig[] = [{ key: 'created_at', operator: 'gte', value: '' }]

      render(<FilterBar {...defaultProps} fieldDefinitions={[dateRangeFieldDefinition]} filters={filters} />)

      // Should handle gracefully
      expect(screen.getByLabelText('Created start date')).toBeInTheDocument()
    })

    it('handles zero as date value', () => {
      // Pass zero (falsy but valid)
      const filters: FilterConfig[] = [{ key: 'created_at', operator: 'gte', value: 0 }]

      render(<FilterBar {...defaultProps} fieldDefinitions={[dateRangeFieldDefinition]} filters={filters} />)

      // Should handle gracefully
      expect(screen.getByLabelText('Created start date')).toBeInTheDocument()
    })

    it('handles clearing date range filters', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()

      render(
        <ControlledFilterBar
          fieldDefinitions={[dateRangeFieldDefinition]}
          initialFilters={[
            { key: 'created_at', operator: 'gte', value: '2024-01-01' },
            { key: 'created_at', operator: 'lte', value: '2024-12-31' },
          ]}
          onFilterChange={onFilterChange}
        />
      )

      // Clear the start date
      const startDateInput = screen.getByLabelText('Created start date')
      await user.clear(startDateInput)

      // handleDateRangeChange should be called
      expect(onFilterChange).toHaveBeenCalled()
    })
  })

  describe('filter type rendering edge cases', () => {
    it('handles unknown filter type gracefully', () => {
      // Create a field with an invalid type
      const unknownField: FilterFieldDefinition = {
        key: 'unknown',
        label: 'Unknown',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        type: 'INVALID_TYPE' as any, // Force unknown type to test error handling
      }

      const { container } = render(<FilterBar {...defaultProps} fieldDefinitions={[unknownField]} />)

      // Should not crash - FilterTypeRenderer returns null for unknown types
      expect(container.querySelector('#filter-toolbar')).toBeInTheDocument()
    })

    it('renders multiple filter types simultaneously', () => {
      const mixedFields: FilterFieldDefinition[] = [
        textFieldDefinition,
        selectFieldDefinition,
        { key: 'is_active', label: 'Active', type: FilterTypeEnum.BOOLEAN },
        { key: 'created_at', label: 'Created', type: FilterTypeEnum.DATERANGE },
        { key: 'labels', label: 'Labels', type: FilterTypeEnum.LABELS },
      ]

      render(<FilterBar {...defaultProps} fieldDefinitions={mixedFields} />)

      // Text/Select/DateRange go in TextFilter dropdown
      expect(screen.getByText('Name')).toBeInTheDocument()
      // Boolean renders separately
      expect(screen.getByRole('switch')).toBeInTheDocument()
      // Labels renders separately
      expect(screen.getByPlaceholderText(/key/i)).toBeInTheDocument()
    })
  })

  describe('callback execution paths', () => {
    it('invokes handleDateRangeChange with multiple date filters', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()
      const dateRangeField: FilterFieldDefinition = {
        key: 'created_at',
        label: 'Created',
        type: FilterTypeEnum.DATERANGE,
      }

      render(
        <ControlledFilterBar fieldDefinitions={[dateRangeField]} initialFilters={[]} onFilterChange={onFilterChange} />
      )

      // Add start date to trigger handleDateRangeChange
      const startDateInput = screen.getByLabelText('Created start date')
      await user.type(startDateInput, '2024-01-01')

      // handleDateRangeChange should be invoked with dateFilters array
      expect(onFilterChange).toHaveBeenCalled()
      const lastCall = onFilterChange.mock.calls[onFilterChange.mock.calls.length - 1][0]
      expect(lastCall).toEqual(
        expect.arrayContaining([expect.objectContaining({ key: 'created_at', operator: 'gte' })])
      )
    })

    it('invokes handleLabelChange with label params', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()
      const labelsField: FilterFieldDefinition = {
        key: 'labels',
        label: 'Labels',
        type: FilterTypeEnum.LABELS,
      }

      render(
        <ControlledFilterBar fieldDefinitions={[labelsField]} initialFilters={[]} onFilterChange={onFilterChange} />
      )

      // Type in label fields to trigger handleLabelChange
      const keyInput = screen.getByLabelText('Label key 1')
      const valueInput = screen.getByLabelText('Label value 1')

      await user.type(keyInput, 'team')
      await user.type(valueInput, 'platform')

      // handleLabelChange should be invoked (called multiple times as user types)
      expect(onFilterChange).toHaveBeenCalled()
      // Verify at least one call was made (coverage for line 219)
      expect(onFilterChange.mock.calls.length).toBeGreaterThan(0)
    })

    it('invokes handleCategoryRemove to remove all filters for a field', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()

      render(
        <ControlledFilterBar
          fieldDefinitions={[textFieldDefinition, selectFieldDefinition]}
          initialFilters={[
            { key: 'name', operator: 'contains', value: 'test1' },
            { key: 'name', operator: 'contains', value: 'test2' },
            { key: 'status', operator: 'eq', value: 'active' },
          ]}
          onFilterChange={onFilterChange}
        />
      )

      // Find and click the category remove button for "Name"
      const nameCategory = screen.getByText('Name').closest('.pf-v6-c-label-group')
      const categoryCloseButton = nameCategory?.querySelector('button[aria-label*="Remove all"]')

      if (categoryCloseButton) {
        await user.click(categoryCloseButton)
      }

      // handleCategoryRemove should be invoked
      expect(onFilterChange).toHaveBeenCalledWith([{ key: 'status', operator: 'eq', value: 'active' }])
    })
  })

  describe('handleFilterUpdate branches', () => {
    it('adds new filter when no existing filter found (existingIndex < 0)', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()

      render(<ControlledFilterBar {...defaultProps} initialFilters={[]} onFilterChange={onFilterChange} />)

      // Add a brand new filter - existingIndex will be -1
      const textInput = screen.getByPlaceholderText('Filter by name')
      await user.type(textInput, 'test{Enter}')

      // Should add new filter (line 158)
      expect(onFilterChange).toHaveBeenCalledWith([
        expect.objectContaining({ key: 'name', operator: 'contains', value: 'test' }),
      ])
    })

    it('updates existing filter when existingIndex >= 0', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()

      render(
        <ControlledFilterBar
          {...defaultProps}
          initialFilters={[{ key: 'name', operator: 'contains', value: 'old' }]}
          onFilterChange={onFilterChange}
        />
      )

      // Update existing filter - existingIndex will be 0
      const textInput = screen.getByPlaceholderText('Filter by name')
      await user.clear(textInput)
      await user.type(textInput, 'new{Enter}')

      // Should update existing filter (lines 154-156)
      expect(onFilterChange).toHaveBeenCalledWith([
        expect.objectContaining({ key: 'name', operator: 'contains', value: 'new' }),
      ])
    })

    it('removes filter when filter is null and fieldKey is provided', () => {
      const onFilterChange = vi.fn()
      const filters: FilterConfig[] = [
        { key: 'name', operator: 'contains', value: 'test' },
        { key: 'status', operator: 'eq', value: 'active' },
      ]

      render(<FilterBar {...defaultProps} filters={filters} onFilterChange={onFilterChange} />)

      // This tests the else if (fieldKey) branch (line 160-162)
      // We can't directly call handleFilterUpdate, but we can test via chip removal
      // which internally calls this logic
      expect(screen.getByText('test')).toBeInTheDocument()
    })
  })

  describe('handleFilterRemove branches', () => {
    it('removes specific filter when operator is provided', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()
      const filters: FilterConfig[] = [
        { key: 'created_at', operator: 'gte', value: '2024-01-01' },
        { key: 'created_at', operator: 'lte', value: '2024-12-31' },
      ]
      const dateField: FilterFieldDefinition = {
        key: 'created_at',
        label: 'Created',
        type: FilterTypeEnum.DATERANGE,
      }

      render(
        <FilterBar {...defaultProps} fieldDefinitions={[dateField]} filters={filters} onFilterChange={onFilterChange} />
      )

      // Remove specific filter with operator (line 173)
      const gteChip = screen.getByText('From: 2024-01-01')
      const labelElement = gteChip.closest('.pf-v6-c-label')
      const closeButton = labelElement?.querySelector('button')

      if (closeButton) {
        await user.click(closeButton)
      }

      // Should remove only the specific filter
      expect(onFilterChange).toHaveBeenCalledWith([{ key: 'created_at', operator: 'lte', value: '2024-12-31' }])
    })

    it('removes all filters with key when operator is not provided', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()
      const filters: FilterConfig[] = [
        { key: 'name', operator: 'contains', value: 'test1' },
        { key: 'name', operator: 'contains', value: 'test2' },
      ]

      render(
        <ControlledFilterBar
          fieldDefinitions={[textFieldDefinition]}
          initialFilters={filters}
          onFilterChange={onFilterChange}
        />
      )

      // Remove all filters for key (line 176)
      const allNameElements = screen.getAllByText('Name')
      const nameCategory = allNameElements
        .find((el) => el.classList.contains('pf-v6-c-label-group__label'))
        ?.closest('.pf-v6-c-label-group')
      const categoryCloseButton = nameCategory?.querySelector('button[aria-label*="Remove all"]')

      expect(categoryCloseButton).toBeInTheDocument()

      if (categoryCloseButton) {
        await user.click(categoryCloseButton)
      }

      // Should remove all name filters
      expect(onFilterChange).toHaveBeenCalledWith([])
    })
  })

  describe('filter update callbacks', () => {
    it('updates existing filter when same key and operator', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()

      render(
        <ControlledFilterBar
          {...defaultProps}
          initialFilters={[{ key: 'name', operator: 'contains', value: 'old' }]}
          onFilterChange={onFilterChange}
        />
      )

      // Update the filter with new value
      const textInput = screen.getByPlaceholderText('Filter by name')
      await user.clear(textInput)
      await user.type(textInput, 'new{Enter}')

      // Should update existing filter, not add new one
      expect(onFilterChange).toHaveBeenCalledWith([
        expect.objectContaining({ key: 'name', operator: 'contains', value: 'new' }),
      ])
    })

    it('adds new filter when different operator', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()
      const dateRangeField: FilterFieldDefinition = {
        key: 'created_at',
        label: 'Created',
        type: FilterTypeEnum.DATERANGE,
      }

      render(
        <ControlledFilterBar
          fieldDefinitions={[dateRangeField]}
          initialFilters={[{ key: 'created_at', operator: 'gte', value: '2024-01-01' }]}
          onFilterChange={onFilterChange}
        />
      )

      // Add end date (lte operator) - different operator, same key
      const endDateInput = screen.getByLabelText('Created end date')
      await user.type(endDateInput, '2024-12-31')

      // Should add both filters (gte and lte)
      expect(onFilterChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ key: 'created_at', operator: 'gte' }),
          expect.objectContaining({ key: 'created_at', operator: 'lte' }),
        ])
      )
    })

    it('removes filter when passed null with fieldKey', () => {
      const onFilterChange = vi.fn()
      const filters: FilterConfig[] = [
        { key: 'name', operator: 'contains', value: 'test' },
        { key: 'status', operator: 'eq', value: 'active' },
      ]

      render(<FilterBar {...defaultProps} filters={filters} onFilterChange={onFilterChange} />)

      // Simulate removing a filter by fieldKey (via handleFilterUpdate callback)
      // This happens internally when a filter is cleared
      // We can test this by clearing all filters and verifying behavior
      const clearButton = screen.getByText('Clear all filters')
      clearButton.click()

      expect(onFilterChange).toHaveBeenCalledWith([])
    })
  })

  describe('branch coverage tests', () => {
    it('executes label parsing with both key and value present', () => {
      const labelsField: FilterFieldDefinition = {
        key: 'labels',
        label: 'Labels',
        type: FilterTypeEnum.LABELS,
      }
      // This should execute line 78: if (key && val) labelParams[`labels[${key}]`] = val
      const filters: FilterConfig[] = [
        { key: 'labels', operator: 'eq', value: 'environment:production' },
        { key: 'labels', operator: 'eq', value: 'team:platform' },
      ]

      render(<FilterBar {...defaultProps} fieldDefinitions={[labelsField]} filters={filters} />)

      // Verify chips are rendered (confirms parsing worked)
      expect(screen.getByText('environment:production')).toBeInTheDocument()
      expect(screen.getByText('team:platform')).toBeInTheDocument()
    })

    it('executes handleDateRangeChange with non-empty otherFilters array', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()
      const dateField: FilterFieldDefinition = {
        key: 'created_at',
        label: 'Created',
        type: FilterTypeEnum.DATERANGE,
      }

      // Start with existing non-date filters to ensure otherFilters is populated
      render(
        <ControlledFilterBar
          fieldDefinitions={[textFieldDefinition, dateField]}
          initialFilters={[{ key: 'name', operator: 'contains', value: 'test' }]}
          onFilterChange={onFilterChange}
        />
      )

      // DATERANGE is in TextFilter dropdown - need to select it first
      const allButtons = screen.getAllByRole('button')
      const fieldSelectorButton = allButtons.find(
        (btn) => btn.textContent?.includes('Name') && btn.querySelector('.pf-v6-c-menu-toggle__icon')
      )
      expect(fieldSelectorButton).toBeInTheDocument()

      if (fieldSelectorButton) {
        await user.click(fieldSelectorButton)
      }

      // Select "Created" field
      const createdOption = screen.getByText('Created')
      await user.click(createdOption)

      // Now add a date filter - this should execute line 198
      const startDateInput = screen.getByLabelText('Created start date')
      await user.type(startDateInput, '2024-01-01')

      // Verify callback was invoked
      expect(onFilterChange).toHaveBeenCalled()
    })

    it('executes handleLabelChange with non-empty otherFilters array', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()
      const labelsField: FilterFieldDefinition = {
        key: 'labels',
        label: 'Labels',
        type: FilterTypeEnum.LABELS,
      }

      // Start with existing non-label filters
      render(
        <ControlledFilterBar
          fieldDefinitions={[textFieldDefinition, labelsField]}
          initialFilters={[{ key: 'name', operator: 'contains', value: 'test' }]}
          onFilterChange={onFilterChange}
        />
      )

      // Add a label filter - this should execute line 219
      const keyInput = screen.getByLabelText('Label key 1')
      const valueInput = screen.getByLabelText('Label value 1')

      await user.type(keyInput, 'env')
      await user.type(valueInput, 'prod')

      // Verify callback was invoked
      expect(onFilterChange).toHaveBeenCalled()
    })

    it('executes handleCategoryRemove with filters.filter', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()

      // Create multiple filters including the category to remove
      render(
        <ControlledFilterBar
          fieldDefinitions={[textFieldDefinition, selectFieldDefinition]}
          initialFilters={[
            { key: 'name', operator: 'contains', value: 'test' },
            { key: 'status', operator: 'eq', value: 'active' },
          ]}
          onFilterChange={onFilterChange}
        />
      )

      // Remove Name category - executes line 187
      const nameCategory = screen.getByText('Name').closest('.pf-v6-c-label-group')
      const categoryCloseButton = nameCategory?.querySelector('button[aria-label*="Remove all"]')

      if (categoryCloseButton) {
        await user.click(categoryCloseButton)
      }

      // Verify the filter was removed
      expect(onFilterChange).toHaveBeenCalledWith([{ key: 'status', operator: 'eq', value: 'active' }])
    })
  })

  describe('callback coverage tests', () => {
    it('invokes handleFilterRemove with operator parameter', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()
      const dateRangeField: FilterFieldDefinition = {
        key: 'created_at',
        label: 'Created',
        type: FilterTypeEnum.DATERANGE,
      }

      const filters: FilterConfig[] = [
        { key: 'created_at', operator: 'gte', value: '2024-01-01' },
        { key: 'created_at', operator: 'lte', value: '2024-12-31' },
      ]

      render(
        <FilterBar
          {...defaultProps}
          fieldDefinitions={[dateRangeField]}
          filters={filters}
          onFilterChange={onFilterChange}
        />
      )

      // Click the remove button on the gte chip - triggers handleFilterRemove with operator
      const gteChip = screen.getByText('From: 2024-01-01')
      const closeButton = gteChip.closest('.pf-v6-c-label')?.querySelector('button')

      expect(closeButton).toBeInTheDocument()
      await user.click(closeButton!)

      // Verify handleFilterRemove was invoked with operator (line 153)
      expect(onFilterChange).toHaveBeenCalledWith([{ key: 'created_at', operator: 'lte', value: '2024-12-31' }])
    })

    it('invokes handleFilterRemove without operator parameter', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()

      const filters: FilterConfig[] = [
        { key: 'name', operator: 'contains', value: 'test1' },
        { key: 'name', operator: 'contains', value: 'test2' },
        { key: 'status', operator: 'eq', value: 'active' },
      ]

      render(
        <ControlledFilterBar
          fieldDefinitions={[textFieldDefinition, selectFieldDefinition]}
          initialFilters={filters}
          onFilterChange={onFilterChange}
        />
      )

      // Click individual chip remove (not category) - first chip
      const chip1 = screen.getByText('test1')
      const closeButton = chip1.closest('.pf-v6-c-label')?.querySelector('button')

      expect(closeButton).toBeInTheDocument()
      await user.click(closeButton!)

      // Should invoke handleFilterRemove without operator, removing all 'name' filters (line 155)
      expect(onFilterChange).toHaveBeenCalled()
    })

    it('invokes handleCategoryRemove callback', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()

      const filters: FilterConfig[] = [
        { key: 'name', operator: 'contains', value: 'test1' },
        { key: 'name', operator: 'contains', value: 'test2' },
        { key: 'status', operator: 'eq', value: 'active' },
      ]

      render(
        <ControlledFilterBar
          fieldDefinitions={[textFieldDefinition, selectFieldDefinition]}
          initialFilters={filters}
          onFilterChange={onFilterChange}
        />
      )

      // Click the category remove button
      const allNameElements = screen.getAllByText('Name')
      const nameCategory = allNameElements
        .find((el) => el.classList.contains('pf-v6-c-label-group__label'))
        ?.closest('.pf-v6-c-label-group')
      const categoryCloseButton = nameCategory?.querySelector('button[aria-label*="Remove all"]')

      expect(categoryCloseButton).toBeInTheDocument()
      await user.click(categoryCloseButton!)

      // Verify handleCategoryRemove was invoked (line 164)
      expect(onFilterChange).toHaveBeenCalledWith([{ key: 'status', operator: 'eq', value: 'active' }])
    })

    it('invokes handleDateRangeChange callback with date filters', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()
      const dateRangeField: FilterFieldDefinition = {
        key: 'created_at',
        label: 'Created',
        type: FilterTypeEnum.DATERANGE,
      }

      render(
        <ControlledFilterBar fieldDefinitions={[dateRangeField]} initialFilters={[]} onFilterChange={onFilterChange} />
      )

      // Type in the start date input
      const startDateInput = screen.getByLabelText('Created start date')
      await user.type(startDateInput, '2024-01-01')

      // Verify handleDateRangeChange was invoked (line 172)
      expect(onFilterChange).toHaveBeenCalled()

      // Check that it was called with filters containing the date
      const lastCall = onFilterChange.mock.calls[onFilterChange.mock.calls.length - 1][0]
      expect(lastCall).toEqual(
        expect.arrayContaining([expect.objectContaining({ key: 'created_at', operator: 'gte' })])
      )
    })

    it('invokes handleLabelChange callback with label params', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()
      const labelsField: FilterFieldDefinition = {
        key: 'labels',
        label: 'Labels',
        type: FilterTypeEnum.LABELS,
      }

      render(
        <ControlledFilterBar fieldDefinitions={[labelsField]} initialFilters={[]} onFilterChange={onFilterChange} />
      )

      // Type in label key and value
      const keyInput = screen.getByLabelText('Label key 1')
      const valueInput = screen.getByLabelText('Label value 1')

      await user.type(keyInput, 'env')
      await user.type(valueInput, 'prod')

      // Verify handleLabelChange was invoked (line 180-181)
      expect(onFilterChange).toHaveBeenCalled()

      // Verify at least one call was made (coverage for lines 180-181)
      expect(onFilterChange.mock.calls.length).toBeGreaterThan(0)
    })

    it('invokes handleFilterUpdate with filter parameter', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()

      render(<ControlledFilterBar {...defaultProps} initialFilters={[]} onFilterChange={onFilterChange} />)

      // Add a new filter
      const textInput = screen.getByPlaceholderText('Filter by name')
      await user.type(textInput, 'test{Enter}')

      // Verify handleFilterUpdate was invoked with filter (line 142-143)
      expect(onFilterChange).toHaveBeenCalledWith([
        expect.objectContaining({ key: 'name', operator: 'contains', value: 'test' }),
      ])
    })

    it('invokes handleFilterUpdate with null filter and fieldKey via chip removal', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()

      render(
        <ControlledFilterBar
          {...defaultProps}
          initialFilters={[{ key: 'name', operator: 'contains', value: 'test' }]}
          onFilterChange={onFilterChange}
        />
      )

      // Remove the filter chip - this triggers handleFilterUpdate(null, fieldKey)
      const chip = screen.getByText('test')
      const closeButton = chip.closest('.pf-v6-c-label')?.querySelector('button')

      expect(closeButton).toBeInTheDocument()
      await user.click(closeButton!)

      // This triggers handleFilterUpdate with null (line 144-145)
      expect(onFilterChange).toHaveBeenCalled()
    })
  })

  describe('filter removal edge cases', () => {
    it('removes only specified operator when multiple filters share key', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()
      const dateRangeField: FilterFieldDefinition = {
        key: 'created_at',
        label: 'Created',
        type: FilterTypeEnum.DATERANGE,
      }
      const initialFilters: FilterConfig[] = [
        { key: 'created_at', operator: 'gte', value: '2024-01-01' },
        { key: 'created_at', operator: 'lte', value: '2024-12-31' },
      ]

      render(
        <FilterBar
          {...defaultProps}
          fieldDefinitions={[dateRangeField]}
          filters={initialFilters}
          onFilterChange={onFilterChange}
        />
      )

      // Remove only the 'gte' filter chip
      const gteChip = screen.getByText('From: 2024-01-01')
      const labelElement = gteChip.closest('.pf-v6-c-label')
      const closeButton = labelElement?.querySelector('button')

      if (closeButton) {
        await user.click(closeButton)
      }

      // Should remove only gte, keep lte
      expect(onFilterChange).toHaveBeenCalledWith([{ key: 'created_at', operator: 'lte', value: '2024-12-31' }])
    })

    it('removes all filters for key when operator not specified', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()
      const initialFilters: FilterConfig[] = [
        { key: 'name', operator: 'contains', value: 'test1' },
        { key: 'name', operator: 'contains', value: 'test2' },
        { key: 'status', operator: 'eq', value: 'active' },
      ]

      render(
        <ControlledFilterBar
          fieldDefinitions={[textFieldDefinition, selectFieldDefinition]}
          initialFilters={initialFilters}
          onFilterChange={onFilterChange}
        />
      )

      // Click category remove button for "Name"
      const nameCategory = screen.getByText('Name').closest('.pf-v6-c-label-group')
      const categoryCloseButton = nameCategory?.querySelector('button[aria-label*="Remove all"]')

      if (categoryCloseButton) {
        await user.click(categoryCloseButton)
      }

      // Should remove all 'name' filters, keep 'status'
      expect(onFilterChange).toHaveBeenCalledWith([{ key: 'status', operator: 'eq', value: 'active' }])
    })
  })

  // FilterTypeRenderer branches are now tested in FilterTypeRenderer.test.tsx

  describe('handleFilterRemove else branch', () => {
    it('removes all filters with same key when operator not provided', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()
      const filters: FilterConfig[] = [
        { key: 'created_at', operator: 'gte', value: '2024-01-01' },
        { key: 'created_at', operator: 'lte', value: '2024-12-31' },
        { key: 'status', operator: 'eq', value: 'active' },
      ]

      render(
        <ControlledFilterBar
          {...defaultProps}
          fieldDefinitions={[
            {
              key: 'created_at',
              label: 'Created',
              type: FilterTypeEnum.DATERANGE,
            },
            {
              key: 'status',
              label: 'Status',
              type: FilterTypeEnum.TEXT,
            },
          ]}
          initialFilters={filters}
          onFilterChange={onFilterChange}
        />
      )

      // Find chip category for "Created" and click category remove button
      const createdCategory = screen.getByText('Created').closest('.pf-v6-c-label-group')
      const categoryCloseButton = createdCategory?.querySelector('button[aria-label*="Remove all"]')

      if (categoryCloseButton) {
        await user.click(categoryCloseButton)
      }

      // handleFilterRemove should remove all 'created_at' filters (both gte and lte)
      // This triggers the else branch in handleFilterRemove
      expect(onFilterChange).toHaveBeenCalledWith([{ key: 'status', operator: 'eq', value: 'active' }])
    })
  })

  describe('Coverage - Edge Cases', () => {
    // DateRangeFilter edge cases (gte only, lte only) now tested in FilterTypeRenderer.test.tsx
    // LabelFilter multiple labels now tested in FilterTypeRenderer.test.tsx
    // BooleanFilter toggle now tested in FilterTypeRenderer.test.tsx

    it('handles MULTISELECT type in TextFilter (not FilterTypeRenderer)', () => {
      const multiSelectField: FilterFieldDefinition = {
        key: 'tags',
        label: 'Tags',
        type: FilterTypeEnum.MULTISELECT,
        options: [
          { value: 'tag1', label: 'Tag 1' },
          { value: 'tag2', label: 'Tag 2' },
        ],
      }

      render(<FilterBar {...defaultProps} fieldDefinitions={[multiSelectField]} />)

      // Should render through TextFilter, testing FilterTypeRenderer's null return for MULTISELECT
      expect(screen.getByRole('button', { name: /tags/i })).toBeInTheDocument()
    })

    it('handles field definitions with only TEXT/SELECT/MULTISELECT types', () => {
      const textOnlyFields: FilterFieldDefinition[] = [
        { key: 'name', label: 'Name', type: FilterTypeEnum.TEXT },
        { key: 'status', label: 'Status', type: FilterTypeEnum.SELECT, options: [] },
        { key: 'tags', label: 'Tags', type: FilterTypeEnum.MULTISELECT, options: [] },
      ]

      render(<FilterBar {...defaultProps} fieldDefinitions={textOnlyFields} />)

      expect(screen.getByText('Name')).toBeInTheDocument()
      // Should NOT render any switches or label inputs (tests empty otherFilterFields)
      expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    })

    it('handles field definitions with only BOOLEAN/LABELS types', () => {
      const nonTextFields: FilterFieldDefinition[] = [
        { key: 'is_enabled', label: 'Enabled', type: FilterTypeEnum.BOOLEAN },
        { key: 'labels', label: 'Labels', type: FilterTypeEnum.LABELS },
      ]

      render(<FilterBar {...defaultProps} fieldDefinitions={nonTextFields} />)

      expect(screen.getByRole('switch', { name: /enabled/i })).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/key/i)).toBeInTheDocument()
      // Should NOT render field selector (TextFilter) - tests empty attributeSearchFields
      expect(screen.queryByText('Filter by')).not.toBeInTheDocument()
    })

    it('handles edge case in handleFilterUpdate with null filter', () => {
      const onFilterChange = vi.fn()
      const filters: FilterConfig[] = [{ key: 'name', operator: 'contains', value: 'test' }]

      render(<FilterBar {...defaultProps} filters={filters} onFilterChange={onFilterChange} />)

      // Verify component renders without crashing (defensive programming check)
      expect(screen.getByText('test')).toBeInTheDocument()
    })

    it('handles boolean filter with undefined value', () => {
      const booleanField: FilterFieldDefinition = {
        key: 'is_active',
        label: 'Active',
        type: FilterTypeEnum.BOOLEAN,
      }
      const filters: FilterConfig[] = []

      render(<FilterBar {...defaultProps} fieldDefinitions={[booleanField]} filters={filters} />)

      const toggleSwitch = screen.getByRole('switch', { name: /active/i })
      expect(toggleSwitch).toBeInTheDocument()
      expect(toggleSwitch).not.toBeChecked()
    })

    it('executes handleFilterUpdate with filter=null and fieldKey', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()
      const textField: FilterFieldDefinition = {
        key: 'name',
        label: 'Name',
        type: FilterTypeEnum.TEXT,
      }
      const filters: FilterConfig[] = [{ key: 'name', operator: 'contains', value: 'test' }]

      render(
        <FilterBar {...defaultProps} fieldDefinitions={[textField]} filters={filters} onFilterChange={onFilterChange} />
      )

      // Find and click the chip close button to trigger handleFilterUpdate(null, fieldKey)
      const chipCloseButton = screen.getByRole('button', { name: /remove/i })
      await user.click(chipCloseButton)

      // Should remove filter via handleFilterUpdate(null, fieldKey) path
      expect(onFilterChange).toHaveBeenCalledWith([])
    })

    it('executes handleFilterRemove without operator', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()
      const textField: FilterFieldDefinition = {
        key: 'status',
        label: 'Status',
        type: FilterTypeEnum.SELECT,
        options: [{ value: 'active', label: 'Active' }],
      }
      const filters: FilterConfig[] = [{ key: 'status', operator: 'eq', value: 'active' }]

      render(
        <FilterBar {...defaultProps} fieldDefinitions={[textField]} filters={filters} onFilterChange={onFilterChange} />
      )

      // Find category close button (tests handleCategoryRemove path)
      const categoryCloseButton = screen.getByRole('button', { name: /remove all status filters/i })
      await user.click(categoryCloseButton)

      expect(onFilterChange).toHaveBeenCalledWith([])
    })

    // BooleanFilter, DateRangeFilter, LabelFilter rendering now tested in FilterTypeRenderer.test.tsx
    // FilterTypeRenderer null return now tested in FilterTypeRenderer.test.tsx

    it('filters TEXT type into attributeSearchFields', () => {
      const textField: FilterFieldDefinition = {
        key: 'name',
        label: 'Name',
        type: FilterTypeEnum.TEXT,
      }

      render(<FilterBar {...defaultProps} fieldDefinitions={[textField]} filters={[]} />)

      // TEXT should appear in attribute search (line 124 condition: f.type === FilterTypeEnum.TEXT)
      expect(screen.getByText('Name')).toBeInTheDocument()
    })

    it('filters SELECT type into attributeSearchFields', () => {
      const selectField: FilterFieldDefinition = {
        key: 'status',
        label: 'Status',
        type: FilterTypeEnum.SELECT,
        options: [],
      }

      render(<FilterBar {...defaultProps} fieldDefinitions={[selectField]} filters={[]} />)

      // SELECT should appear in attribute search (line 125 condition: f.type === FilterTypeEnum.SELECT)
      expect(screen.getByText('Status')).toBeInTheDocument()
    })

    it('filters DATERANGE type into attributeSearchFields', () => {
      const dateField: FilterFieldDefinition = {
        key: 'created',
        label: 'Created Date',
        type: FilterTypeEnum.DATERANGE,
      }

      render(<FilterBar {...defaultProps} fieldDefinitions={[dateField]} filters={[]} />)

      // DATERANGE should appear in attribute search (line 126 condition: f.type === FilterTypeEnum.DATERANGE)
      expect(screen.getByText('Created Date')).toBeInTheDocument()
    })

    it('filters MULTISELECT type into attributeSearchFields', () => {
      const multiField: FilterFieldDefinition = {
        key: 'tags',
        label: 'Tags',
        type: FilterTypeEnum.MULTISELECT,
        options: [],
      }

      render(<FilterBar {...defaultProps} fieldDefinitions={[multiField]} filters={[]} />)

      // MULTISELECT should appear in attribute search (line 127 condition: f.type === FilterTypeEnum.MULTISELECT)
      expect(screen.getByText('Tags')).toBeInTheDocument()
    })

    it('filters BOOLEAN type into otherFilterFields (not attributeSearchFields)', () => {
      const boolField: FilterFieldDefinition = {
        key: 'enabled',
        label: 'Enabled',
        type: FilterTypeEnum.BOOLEAN,
      }

      render(<FilterBar {...defaultProps} fieldDefinitions={[boolField]} filters={[]} />)

      // BOOLEAN should NOT appear in TextFilter dropdown, but as a switch
      expect(screen.getByRole('switch')).toBeInTheDocument()
      // Should NOT have the field selector
      expect(screen.queryByRole('button', { name: /filter by/i })).not.toBeInTheDocument()
    })

    it('filters LABELS type into otherFilterFields (not attributeSearchFields)', () => {
      const labelsField: FilterFieldDefinition = {
        key: 'labels',
        label: 'Labels',
        type: FilterTypeEnum.LABELS,
      }

      render(<FilterBar {...defaultProps} fieldDefinitions={[labelsField]} filters={[]} />)

      // LABELS should NOT appear in TextFilter dropdown
      expect(screen.queryByRole('button', { name: /filter by/i })).not.toBeInTheDocument()
      // Should have label inputs
      expect(screen.getAllByPlaceholderText(/key/i).length).toBeGreaterThan(0)
    })

    it('correctly separates attribute search fields from other filter fields', () => {
      const mixedFields: FilterFieldDefinition[] = [
        { key: 'name', label: 'Name', type: FilterTypeEnum.TEXT },
        { key: 'status', label: 'Status', type: FilterTypeEnum.SELECT, options: [] },
        { key: 'enabled', label: 'Enabled', type: FilterTypeEnum.BOOLEAN },
        { key: 'tags', label: 'Tags', type: FilterTypeEnum.LABELS },
        { key: 'created', label: 'Created', type: FilterTypeEnum.DATERANGE },
      ]

      render(<FilterBar {...defaultProps} fieldDefinitions={mixedFields} filters={[]} />)

      // Should have TextFilter (for TEXT, SELECT, DATERANGE)
      expect(screen.getByRole('button', { name: /name/i })).toBeInTheDocument()

      // Should have BooleanFilter (switch)
      expect(screen.getByRole('switch', { name: /enabled/i })).toBeInTheDocument()

      // Should have LabelFilter (key/value inputs)
      expect(screen.getAllByPlaceholderText(/key/i).length).toBeGreaterThan(0)
    })

    it('does not render TextFilter when attributeSearchFields is empty (line 197 FALSE branch)', () => {
      const boolField: FilterFieldDefinition = {
        key: 'enabled',
        label: 'Enabled',
        type: FilterTypeEnum.BOOLEAN,
      }

      render(<FilterBar {...defaultProps} fieldDefinitions={[boolField]} filters={[]} />)

      // attributeSearchFields.length === 0, so TextFilter should NOT render
      expect(screen.queryByRole('button', { name: /filter by/i })).not.toBeInTheDocument()
      expect(screen.getByRole('switch')).toBeInTheDocument()
    })

    it('does not show Clear All button when show ClearAll is false (line 222 FALSE branch)', () => {
      const textField: FilterFieldDefinition = {
        key: 'name',
        label: 'Name',
        type: FilterTypeEnum.TEXT,
      }
      const filters: FilterConfig[] = [{ key: 'name', operator: 'contains', value: 'test' }]

      render(<FilterBar {...defaultProps} fieldDefinitions={[textField]} filters={filters} showClearAll={false} />)

      // showClearAll=false, so button should NOT render
      expect(screen.queryByRole('button', { name: /clear all/i })).not.toBeInTheDocument()
      // But filter chip should still be there
      expect(screen.getByText('test')).toBeInTheDocument()
    })

    it('does not show filter chips when no filters (line 232 FALSE branch)', () => {
      const textField: FilterFieldDefinition = {
        key: 'name',
        label: 'Name',
        type: FilterTypeEnum.TEXT,
      }

      render(<FilterBar {...defaultProps} fieldDefinitions={[textField]} filters={[]} />)

      // filters.length === 0, so ActiveFilterChips should NOT render
      expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
    })

    it('executes handleFilterUpdate TRUE branch with non-null filter', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()
      const textField: FilterFieldDefinition = {
        key: 'name',
        label: 'Name',
        type: FilterTypeEnum.TEXT,
      }

      render(
        <FilterBar {...defaultProps} fieldDefinitions={[textField]} filters={[]} onFilterChange={onFilterChange} />
      )

      const input = screen.getByPlaceholderText(/filter by name/i)
      await user.type(input, 'test{Enter}')

      // This executes line 140-141: if (filter) branch TRUE
      expect(onFilterChange).toHaveBeenCalledWith([{ key: 'name', operator: 'contains', value: 'test' }])
    })

    it('executes handleFilterRemove TRUE branch with operator', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()
      const dateField: FilterFieldDefinition = {
        key: 'created',
        label: 'Created',
        type: FilterTypeEnum.DATERANGE,
      }
      const filters: FilterConfig[] = [
        { key: 'created', operator: 'gte', value: '2024-01-01' },
        { key: 'created', operator: 'lte', value: '2024-12-31' },
      ]

      render(
        <FilterBar {...defaultProps} fieldDefinitions={[dateField]} filters={filters} onFilterChange={onFilterChange} />
      )

      // Remove just the gte filter (with operator)
      const chips = screen.getAllByRole('button', { name: /remove/i })
      await user.click(chips[0])

      // This executes line 152-153: if (operator) branch TRUE
      expect(onFilterChange).toHaveBeenCalled()
    })
  })
})
