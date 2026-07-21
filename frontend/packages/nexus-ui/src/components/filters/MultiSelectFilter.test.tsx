import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import type { FilterConfig } from '../../types/filters'

import { MultiSelectFilter } from './MultiSelectFilter'

const statusOptions = [
  { label: 'Running', value: 'running' },
  { label: 'Completed', value: 'completed' },
  { label: 'Failed', value: 'failed' },
  { label: 'Pending', value: 'pending' },
]

describe('MultiSelectFilter', () => {
  const onChange = vi.fn()
  const defaultProps = {
    fieldKey: 'status',
    label: 'Status',
    options: statusOptions,
    selectedValues: [] as string[],
    onChange,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a toggle button with default placeholder', () => {
    render(<MultiSelectFilter {...defaultProps} />)

    expect(screen.getByRole('button', { name: /filter by status/i })).toBeInTheDocument()
  })

  it('renders a toggle button with custom placeholder', () => {
    render(<MultiSelectFilter {...defaultProps} placeholder="Choose statuses" />)

    expect(screen.getByRole('button', { name: /choose statuses/i })).toBeInTheDocument()
  })

  it('shows badge with selected count', () => {
    render(<MultiSelectFilter {...defaultProps} selectedValues={['running', 'failed']} />)

    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('hides badge when nothing is selected', () => {
    render(<MultiSelectFilter {...defaultProps} />)

    expect(screen.queryByTestId('filter-badge')).not.toBeInTheDocument()
  })

  it('opens dropdown showing checkbox options with aria-label', async () => {
    const user = userEvent.setup()
    render(<MultiSelectFilter {...defaultProps} />)

    await user.click(screen.getByRole('button'))

    const menu = screen.getByRole('menu')
    expect(menu).toBeInTheDocument()
    expect(menu).toHaveAccessibleName('Filter by Status')
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(statusOptions.length)
    expect(screen.getByText('Select All')).toBeInTheDocument()
    expect(screen.getByText('Clear All')).toBeInTheDocument()
  })

  it('has no accessibility violations when open', async () => {
    const user = userEvent.setup()
    const { container } = render(<MultiSelectFilter {...defaultProps} selectedValues={['running']} />)

    await user.click(screen.getByRole('button'))

    expect(await axe(container)).toHaveNoViolations()
  })

  it('reflects selected state on checkboxes', async () => {
    const user = userEvent.setup()
    render(<MultiSelectFilter {...defaultProps} selectedValues={['running']} />)

    await user.click(screen.getByRole('button'))

    expect(screen.getByRole('checkbox', { name: 'Running' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Failed' })).not.toBeChecked()
  })

  describe('selection', () => {
    it('selects a value', async () => {
      const user = userEvent.setup()
      render(<MultiSelectFilter {...defaultProps} />)

      await user.click(screen.getByRole('button'))
      await user.click(screen.getByText('Running'))

      expect(onChange).toHaveBeenCalledWith<[FilterConfig]>({
        key: 'status',
        operator: 'in',
        value: ['running'],
      })
    })

    it('appends to existing selections', async () => {
      const user = userEvent.setup()
      render(<MultiSelectFilter {...defaultProps} selectedValues={['running']} />)

      await user.click(screen.getByRole('button'))
      await user.click(screen.getByText('Failed'))

      expect(onChange).toHaveBeenCalledWith<[FilterConfig]>({
        key: 'status',
        operator: 'in',
        value: ['running', 'failed'],
      })
    })

    it('removes a value when deselected', async () => {
      const user = userEvent.setup()
      render(<MultiSelectFilter {...defaultProps} selectedValues={['running', 'failed']} />)

      await user.click(screen.getByRole('button'))
      await user.click(screen.getByText('Running'))

      expect(onChange).toHaveBeenCalledWith<[FilterConfig]>({
        key: 'status',
        operator: 'in',
        value: ['failed'],
      })
    })

    it('emits null when last value is deselected', async () => {
      const user = userEvent.setup()
      render(<MultiSelectFilter {...defaultProps} selectedValues={['running']} />)

      await user.click(screen.getByRole('button'))
      await user.click(screen.getByText('Running'))

      expect(onChange).toHaveBeenCalledWith(null, 'status')
    })

    it('keeps dropdown open after selection', async () => {
      const user = userEvent.setup()
      render(<MultiSelectFilter {...defaultProps} />)

      await user.click(screen.getByRole('button'))
      await user.click(screen.getByText('Running'))

      expect(screen.getByRole('menu')).toBeInTheDocument()
    })

    it('uses custom operator when provided', async () => {
      const user = userEvent.setup()
      render(<MultiSelectFilter {...defaultProps} operator="eq" />)

      await user.click(screen.getByRole('button'))
      await user.click(screen.getByText('Running'))

      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ operator: 'eq' }))
    })

    it('selects all options via Select All', async () => {
      const user = userEvent.setup()
      render(<MultiSelectFilter {...defaultProps} selectedValues={['running']} />)

      await user.click(screen.getByRole('button'))
      await user.click(screen.getByText('Select All'))

      expect(onChange).toHaveBeenCalledWith<[FilterConfig]>({
        key: 'status',
        operator: 'in',
        value: ['running', 'completed', 'failed', 'pending'],
      })
    })

    it('clears all options via Clear All', async () => {
      const user = userEvent.setup()
      render(<MultiSelectFilter {...defaultProps} selectedValues={['running', 'failed']} />)

      await user.click(screen.getByRole('button'))
      await user.click(screen.getByText('Clear All'))

      expect(onChange).toHaveBeenCalledWith(null, 'status')
    })

    it('does not emit when Clear All is clicked with no selection', async () => {
      const user = userEvent.setup()
      render(<MultiSelectFilter {...defaultProps} />)

      await user.click(screen.getByRole('button'))
      await user.click(screen.getByText('Clear All'))

      expect(onChange).not.toHaveBeenCalled()
    })
  })
})
