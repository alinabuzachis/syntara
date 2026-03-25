import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { FilterConfig, FilterFieldDefinition } from '../../types/filters'
import { FilterTypeEnum } from '../../types/filters'

import { FilterTypeRenderer } from './FilterTypeRenderer'

describe('FilterTypeRenderer', () => {
  const mockOnFilterUpdate = vi.fn()
  const mockOnDateRangeChange = vi.fn()
  const mockOnLabelChange = vi.fn()

  const defaultProps = {
    filters: [] as FilterConfig[],
    onFilterUpdate: mockOnFilterUpdate,
    onDateRangeChange: mockOnDateRangeChange,
    onLabelChange: mockOnLabelChange,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('BOOLEAN type', () => {
    it('renders BooleanFilter for BOOLEAN field type', () => {
      const field: FilterFieldDefinition = {
        key: 'is_enabled',
        label: 'Enabled',
        type: FilterTypeEnum.BOOLEAN,
      }

      render(<FilterTypeRenderer {...defaultProps} field={field} />)

      expect(screen.getByRole('switch', { name: /enabled/i })).toBeInTheDocument()
    })

    it('renders BooleanFilter with existing filter value', () => {
      const field: FilterFieldDefinition = {
        key: 'is_enabled',
        label: 'Enabled',
        type: FilterTypeEnum.BOOLEAN,
      }
      const filters: FilterConfig[] = [{ key: 'is_enabled', operator: 'eq', value: true }]

      render(<FilterTypeRenderer {...defaultProps} field={field} filters={filters} />)

      const toggle = screen.getByRole('switch', { name: /enabled/i })
      expect(toggle).toBeChecked()
    })

    it('calls onFilterUpdate when boolean filter changes', async () => {
      const user = userEvent.setup()
      const field: FilterFieldDefinition = {
        key: 'is_enabled',
        label: 'Enabled',
        type: FilterTypeEnum.BOOLEAN,
      }

      render(<FilterTypeRenderer {...defaultProps} field={field} />)

      const toggle = screen.getByRole('switch', { name: /enabled/i })
      await user.click(toggle)

      expect(mockOnFilterUpdate).toHaveBeenCalledWith({ key: 'is_enabled', operator: 'eq', value: true }, 'is_enabled')
    })
  })

  describe('DATERANGE type', () => {
    it('renders DateRangeFilter for DATERANGE field type', () => {
      const field: FilterFieldDefinition = {
        key: 'created_at',
        label: 'Created Date',
        type: FilterTypeEnum.DATERANGE,
      }

      render(<FilterTypeRenderer {...defaultProps} field={field} />)

      expect(screen.getByLabelText('Created Date start date')).toBeInTheDocument()
      expect(screen.getByLabelText('Created Date end date')).toBeInTheDocument()
    })

    it('renders DateRangeFilter with gte filter', () => {
      const field: FilterFieldDefinition = {
        key: 'created_at',
        label: 'Created Date',
        type: FilterTypeEnum.DATERANGE,
      }
      const filters: FilterConfig[] = [{ key: 'created_at', operator: 'gte', value: '2024-01-01' }]

      render(<FilterTypeRenderer {...defaultProps} field={field} filters={filters} />)

      const startInput = screen.getByLabelText('Created Date start date')
      expect(startInput).toHaveValue('2024-01-01')
    })

    it('renders DateRangeFilter with lte filter', () => {
      const field: FilterFieldDefinition = {
        key: 'created_at',
        label: 'Created Date',
        type: FilterTypeEnum.DATERANGE,
      }
      const filters: FilterConfig[] = [{ key: 'created_at', operator: 'lte', value: '2024-12-31' }]

      render(<FilterTypeRenderer {...defaultProps} field={field} filters={filters} />)

      const endInput = screen.getByLabelText('Created Date end date')
      expect(endInput).toHaveValue('2024-12-31')
    })

    it('renders DateRangeFilter with both gte and lte filters', () => {
      const field: FilterFieldDefinition = {
        key: 'created_at',
        label: 'Created Date',
        type: FilterTypeEnum.DATERANGE,
      }
      const filters: FilterConfig[] = [
        { key: 'created_at', operator: 'gte', value: '2024-01-01' },
        { key: 'created_at', operator: 'lte', value: '2024-12-31' },
      ]

      render(<FilterTypeRenderer {...defaultProps} field={field} filters={filters} />)

      expect(screen.getByLabelText('Created Date start date')).toHaveValue('2024-01-01')
      expect(screen.getByLabelText('Created Date end date')).toHaveValue('2024-12-31')
    })

    it('calls onDateRangeChange when date range changes', async () => {
      const user = userEvent.setup()
      const field: FilterFieldDefinition = {
        key: 'created_at',
        label: 'Created Date',
        type: FilterTypeEnum.DATERANGE,
      }

      render(<FilterTypeRenderer {...defaultProps} field={field} />)

      const startInput = screen.getByLabelText('Created Date start date')
      await user.type(startInput, '2024-01-01')
      await user.tab()

      expect(mockOnDateRangeChange).toHaveBeenCalledWith('created_at', expect.any(Array))
    })
  })

  describe('LABELS type', () => {
    it('renders LabelFilter for LABELS field type', () => {
      const field: FilterFieldDefinition = {
        key: 'labels',
        label: 'Labels',
        type: FilterTypeEnum.LABELS,
      }

      render(<FilterTypeRenderer {...defaultProps} field={field} />)

      expect(screen.getByPlaceholderText(/key/i)).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/value/i)).toBeInTheDocument()
    })

    it('renders LabelFilter with existing label filters', () => {
      const field: FilterFieldDefinition = {
        key: 'labels',
        label: 'Labels',
        type: FilterTypeEnum.LABELS,
      }
      const filters: FilterConfig[] = [
        { key: 'labels', operator: 'eq', value: 'env:prod' },
        { key: 'labels', operator: 'eq', value: 'team:platform' },
      ]

      render(<FilterTypeRenderer {...defaultProps} field={field} filters={filters} />)

      // LabelFilter displays labels as separate key/value inputs
      // The values are displayed in the chip labels
      const keyInputs = screen.getAllByPlaceholderText(/key/i)
      const valueInputs = screen.getAllByPlaceholderText(/value/i)
      expect(keyInputs.length).toBeGreaterThan(0)
      expect(valueInputs.length).toBeGreaterThan(0)
    })

    it('calls onLabelChange when labels change', async () => {
      const user = userEvent.setup()
      const field: FilterFieldDefinition = {
        key: 'labels',
        label: 'Labels',
        type: FilterTypeEnum.LABELS,
      }

      render(<FilterTypeRenderer {...defaultProps} field={field} />)

      const keyInput = screen.getByPlaceholderText(/key/i)
      await user.type(keyInput, 'env')

      const valueInput = screen.getByPlaceholderText(/value/i)
      await user.type(valueInput, 'prod{Enter}')

      expect(mockOnLabelChange).toHaveBeenCalledWith('labels', expect.any(Object))
    })
  })

  describe('Unknown/unsupported types', () => {
    it('returns null for TEXT type (handled by TextFilter)', () => {
      const field: FilterFieldDefinition = {
        key: 'name',
        label: 'Name',
        type: FilterTypeEnum.TEXT,
      }

      const { container } = render(<FilterTypeRenderer {...defaultProps} field={field} />)

      // Should render nothing (null)
      expect(container.firstChild).toBeNull()
    })

    it('returns null for SELECT type (handled by TextFilter)', () => {
      const field: FilterFieldDefinition = {
        key: 'status',
        label: 'Status',
        type: FilterTypeEnum.SELECT,
        options: [],
      }

      const { container } = render(<FilterTypeRenderer {...defaultProps} field={field} />)

      expect(container.firstChild).toBeNull()
    })

    it('returns null for MULTISELECT type (handled by TextFilter)', () => {
      const field: FilterFieldDefinition = {
        key: 'tags',
        label: 'Tags',
        type: FilterTypeEnum.MULTISELECT,
        options: [],
      }

      const { container } = render(<FilterTypeRenderer {...defaultProps} field={field} />)

      expect(container.firstChild).toBeNull()
    })
  })
})
