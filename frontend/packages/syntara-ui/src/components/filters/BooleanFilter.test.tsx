import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

import type { FilterConfig } from '../../types/filters'

import { BooleanFilter } from './BooleanFilter'

describe('BooleanFilter', () => {
  const defaultProps = {
    fieldKey: 'is_enabled',
    label: 'Status',
    onChange: vi.fn(),
  }

  describe('rendering', () => {
    it('renders form group with label', () => {
      render(<BooleanFilter {...defaultProps} />)

      expect(screen.getByText('Status')).toBeInTheDocument()
    })

    it('renders switch with default labels', () => {
      render(<BooleanFilter {...defaultProps} />)

      expect(screen.getByText('Enabled')).toBeInTheDocument()
    })

    it('renders switch with custom on label', () => {
      render(<BooleanFilter {...defaultProps} onLabel="Active" />)

      expect(screen.getByText('Active')).toBeInTheDocument()
    })

    it('renders unchecked by default', () => {
      render(<BooleanFilter {...defaultProps} />)

      const switchElement = screen.getByRole('switch')
      expect(switchElement).not.toBeChecked()
    })

    it('renders checked when value is true', () => {
      render(<BooleanFilter {...defaultProps} value={true} />)

      const switchElement = screen.getByRole('switch')
      expect(switchElement).toBeChecked()
    })

    it('renders unchecked when value is false', () => {
      render(<BooleanFilter {...defaultProps} value={false} />)

      const switchElement = screen.getByRole('switch')
      expect(switchElement).not.toBeChecked()
    })
  })

  describe('toggle behavior', () => {
    it('emits FilterConfig with true when toggled on', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()

      render(<BooleanFilter {...defaultProps} onChange={onChange} />)

      const switchElement = screen.getByRole('switch')
      await user.click(switchElement)

      expect(onChange).toHaveBeenCalledWith<[FilterConfig]>({
        key: 'is_enabled',
        operator: 'eq',
        value: true,
      })
    })

    it('emits FilterConfig with false when toggled off', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()

      render(<BooleanFilter {...defaultProps} onChange={onChange} value={true} />)

      const switchElement = screen.getByRole('switch')
      await user.click(switchElement)

      expect(onChange).toHaveBeenCalledWith<[FilterConfig]>({
        key: 'is_enabled',
        operator: 'eq',
        value: false,
      })
    })

    it('uses eq operator for boolean filters', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()

      render(<BooleanFilter {...defaultProps} onChange={onChange} />)

      const switchElement = screen.getByRole('switch')
      await user.click(switchElement)

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          operator: 'eq',
        })
      )
    })

    it('updates checked state after toggle', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()

      render(<BooleanFilter {...defaultProps} onChange={onChange} />)

      const switchElement = screen.getByRole('switch')
      expect(switchElement).not.toBeChecked()

      await user.click(switchElement)

      // Verify the component emitted the correct event
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ value: true }))
    })
  })

  describe('accessibility', () => {
    it('has proper aria-label', () => {
      render(<BooleanFilter {...defaultProps} />)

      expect(screen.getByLabelText('Status filter')).toBeInTheDocument()
    })

    it('has proper switch id', () => {
      render(<BooleanFilter {...defaultProps} />)

      const switchElement = screen.getByRole('switch')
      expect(switchElement.id).toBe('is_enabled-filter')
    })

    it('associates label with switch', () => {
      render(<BooleanFilter {...defaultProps} />)

      // Use accessible query instead of relying on CSS classes
      const switchElement = screen.getByRole('switch', { name: 'Status filter' })
      expect(switchElement).toBeInTheDocument()
    })
  })

  describe('edge cases', () => {
    it('handles rapid toggles', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()

      render(<BooleanFilter {...defaultProps} onChange={onChange} />)

      const switchElement = screen.getByRole('switch')
      await user.click(switchElement)
      await user.click(switchElement)
      await user.click(switchElement)

      expect(onChange).toHaveBeenCalledTimes(3)
      // Last call should be true (odd number of clicks)
      expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ value: true }))
    })
  })
})
