import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

import type { FilterConfig } from '../../types/filters'

import { ControlledTextFilter } from './test-helpers'
import { TextFilter } from './TextFilter'

describe('TextFilter', () => {
  const defaultProps = {
    fieldKey: 'name',
    label: 'Name',
    onChange: vi.fn(),
  }

  describe('rendering', () => {
    it('renders text input with placeholder', () => {
      render(<TextFilter {...defaultProps} />)

      expect(screen.getByPlaceholderText('Filter by name')).toBeInTheDocument()
    })

    it('renders with custom placeholder', () => {
      render(<TextFilter {...defaultProps} placeholder="Search names" />)

      expect(screen.getByPlaceholderText('Search names')).toBeInTheDocument()
    })

    it('renders with initial value', () => {
      render(<TextFilter {...defaultProps} value="test" />)

      expect(screen.getByDisplayValue('test')).toBeInTheDocument()
    })

    it('renders search button', () => {
      render(<TextFilter {...defaultProps} />)

      expect(screen.getByLabelText('Search')).toBeInTheDocument()
    })

    it('does not show clear button when empty', () => {
      render(<TextFilter {...defaultProps} />)

      expect(screen.queryByLabelText('Clear filter')).not.toBeInTheDocument()
    })

    it('shows clear button when value exists', () => {
      render(<TextFilter {...defaultProps} value="test" />)

      expect(screen.getByLabelText('Clear filter')).toBeInTheDocument()
    })
  })

  describe('value change behavior', () => {
    it('emits FilterConfig with default "contains" operator', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()

      render(<ControlledTextFilter {...defaultProps} onChange={onChange} />)

      const input = screen.getByPlaceholderText('Filter by name')
      await user.type(input, 'deploy')

      // Check last call (after typing "deploy")
      const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]
      expect(lastCall[0]).toEqual<FilterConfig>({
        key: 'name',
        operator: 'contains',
        value: 'deploy',
      })
    })

    it('uses custom defaultOperator when provided', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()

      render(<ControlledTextFilter {...defaultProps} onChange={onChange} defaultOperator="starts_with" />)

      const input = screen.getByPlaceholderText('Filter by name')
      await user.type(input, 'test')

      const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]
      expect(lastCall[0]).toEqual<FilterConfig>({
        key: 'name',
        operator: 'starts_with',
        value: 'test',
      })
    })

    it('emits null when value is cleared', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()

      render(<TextFilter {...defaultProps} onChange={onChange} value="test" />)

      const input = screen.getByDisplayValue('test')
      await user.clear(input)

      expect(onChange).toHaveBeenCalledWith(null)
    })

    it('trims whitespace from value', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()

      render(<ControlledTextFilter {...defaultProps} onChange={onChange} />)

      const input = screen.getByPlaceholderText('Filter by name')
      await user.type(input, '  test  ')

      const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]
      expect(lastCall[0]).toEqual<FilterConfig>({
        key: 'name',
        operator: 'contains',
        value: 'test',
      })
    })

    it('emits null when value is whitespace only', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()

      render(<TextFilter {...defaultProps} onChange={onChange} />)

      const input = screen.getByPlaceholderText('Filter by name')
      await user.type(input, '   ')

      expect(onChange).toHaveBeenCalledWith(null)
    })
  })

  describe('clear button', () => {
    it('clears input value when clicked', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()

      render(<ControlledTextFilter {...defaultProps} onChange={onChange} initialValue="test" />)

      const clearButton = screen.getByLabelText('Clear filter')
      await user.click(clearButton)

      expect(screen.getByPlaceholderText('Filter by name')).toHaveValue('')
    })

    it('emits null when clear button clicked', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()

      render(<TextFilter {...defaultProps} onChange={onChange} value="test" />)

      const clearButton = screen.getByLabelText('Clear filter')
      await user.click(clearButton)

      expect(onChange).toHaveBeenCalledWith(null)
    })

    it('hides clear button after clearing', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()

      render(<ControlledTextFilter {...defaultProps} onChange={onChange} initialValue="test" />)

      const clearButton = screen.getByLabelText('Clear filter')
      await user.click(clearButton)

      expect(screen.queryByLabelText('Clear filter')).not.toBeInTheDocument()
    })
  })

  describe('search button', () => {
    it('disables search button when input is empty', () => {
      render(<TextFilter {...defaultProps} />)

      const searchButton = screen.getByLabelText('Search')
      expect(searchButton).toBeDisabled()
    })

    it('enables search button when input has value', () => {
      render(<TextFilter {...defaultProps} value="test" />)

      const searchButton = screen.getByLabelText('Search')
      expect(searchButton).not.toBeDisabled()
    })

    it('disables search button for whitespace-only input', async () => {
      const user = userEvent.setup()

      render(<TextFilter {...defaultProps} />)

      const input = screen.getByPlaceholderText('Filter by name')
      await user.type(input, '   ')

      const searchButton = screen.getByLabelText('Search')
      expect(searchButton).toBeDisabled()
    })
  })

  describe('accessibility', () => {
    it('has proper aria-label on input', () => {
      render(<TextFilter {...defaultProps} />)

      expect(screen.getByLabelText('Name filter')).toBeInTheDocument()
    })

    it('has proper aria-label on search button', () => {
      render(<TextFilter {...defaultProps} />)

      expect(screen.getByLabelText('Search')).toBeInTheDocument()
    })

    it('has proper aria-label on clear button', () => {
      render(<TextFilter {...defaultProps} value="test" />)

      expect(screen.getByLabelText('Clear filter')).toBeInTheDocument()
    })
  })
})
