import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

import type { FilterConfig } from '../../types/filters'

import { SelectFilter } from './SelectFilter'
import { ControlledSelectFilter } from './test-helpers'

describe('SelectFilter', () => {
  const options = [
    { label: 'Running', value: 'running' },
    { label: 'Failed', value: 'failed' },
    { label: 'Pending', value: 'pending' },
  ]

  const defaultProps = {
    fieldKey: 'status',
    label: 'Status',
    options,
    onChange: vi.fn(),
  }

  describe('rendering', () => {
    it('renders select toggle with placeholder', () => {
      render(<SelectFilter {...defaultProps} />)

      expect(screen.getByText('Select status')).toBeInTheDocument()
    })

    it('renders with custom placeholder', () => {
      render(<SelectFilter {...defaultProps} placeholder="Choose status" />)

      expect(screen.getByText('Choose status')).toBeInTheDocument()
    })

    it('renders with selected value label', () => {
      render(<SelectFilter {...defaultProps} value="running" />)

      expect(screen.getByText('Running')).toBeInTheDocument()
    })

    it('renders multi-select count when isMulti', () => {
      render(<SelectFilter {...defaultProps} value={['running', 'failed']} isMulti={true} />)

      expect(screen.getByText('2 selected')).toBeInTheDocument()
    })
  })

  describe('single-select mode', () => {
    it('opens dropdown when toggle clicked', async () => {
      const user = userEvent.setup()

      render(<SelectFilter {...defaultProps} />)

      const toggle = screen.getByText('Select status')
      await user.click(toggle)

      expect(screen.getByText('Running')).toBeInTheDocument()
      expect(screen.getByText('Failed')).toBeInTheDocument()
      expect(screen.getByText('Pending')).toBeInTheDocument()
    })

    it('emits FilterConfig with "eq" operator on selection', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()

      render(<SelectFilter {...defaultProps} onChange={onChange} />)

      const toggle = screen.getByText('Select status')
      await user.click(toggle)

      const option = screen.getByText('Running')
      await user.click(option)

      expect(onChange).toHaveBeenCalledWith<[FilterConfig]>({
        key: 'status',
        operator: 'eq',
        value: 'running',
      })
    })

    it('closes dropdown after selection', async () => {
      const user = userEvent.setup()

      render(<ControlledSelectFilter {...defaultProps} />)

      const toggle = screen.getByText('Select status')
      await user.click(toggle)

      const option = screen.getByText('Running')
      await user.click(option)

      // Wait for dropdown to close
      await waitFor(() => {
        expect(screen.queryByText('Failed')).not.toBeInTheDocument()
      })
    })

    it('shows selected option label in toggle', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()

      render(<ControlledSelectFilter {...defaultProps} onChange={onChange} />)

      const toggle = screen.getByText('Select status')
      await user.click(toggle)

      const option = screen.getAllByText('Running')[0]
      await user.click(option)

      // After selection, dropdown closes and toggle shows "Running"
      expect(screen.getAllByText('Running')[0]).toBeInTheDocument()
      // Dropdown should be closed - wait for it to close
      await waitFor(() => {
        expect(screen.queryByText('Failed')).not.toBeInTheDocument()
      })
    })
  })

  describe('multi-select mode', () => {
    it('renders options with checkboxes when isMulti', async () => {
      const user = userEvent.setup()

      render(<SelectFilter {...defaultProps} isMulti={true} />)

      const toggle = screen.getByText('0 selected')
      await user.click(toggle)

      // PatternFly Select renders options - verify by checking for option text
      expect(screen.getByText('Running')).toBeInTheDocument()
      expect(screen.getByText('Failed')).toBeInTheDocument()
      expect(screen.getByText('Pending')).toBeInTheDocument()
    })

    it('emits FilterConfig with "in" operator on multi-selection', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()

      render(<SelectFilter {...defaultProps} onChange={onChange} isMulti={true} />)

      const toggle = screen.getByText('0 selected')
      await user.click(toggle)

      const runningOption = screen.getByText('Running')
      await user.click(runningOption)

      expect(onChange).toHaveBeenCalledWith<[FilterConfig]>({
        key: 'status',
        operator: 'in',
        value: ['running'],
      })
    })

    it('allows selecting multiple options', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()

      render(<ControlledSelectFilter {...defaultProps} onChange={onChange} isMulti={true} />)

      const toggle = screen.getByText('0 selected')
      await user.click(toggle)

      const runningOption = screen.getByText('Running')
      await user.click(runningOption)

      const failedOption = screen.getByText('Failed')
      await user.click(failedOption)

      expect(onChange).toHaveBeenLastCalledWith<[FilterConfig]>({
        key: 'status',
        operator: 'in',
        value: ['running', 'failed'],
      })
    })

    it('allows deselecting options', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()

      render(<SelectFilter {...defaultProps} onChange={onChange} value={['running', 'failed']} isMulti={true} />)

      const toggle = screen.getByText('2 selected')
      await user.click(toggle)

      const runningOption = screen.getByText('Running')
      await user.click(runningOption)

      expect(onChange).toHaveBeenLastCalledWith<[FilterConfig]>({
        key: 'status',
        operator: 'in',
        value: ['failed'],
      })
    })

    it('emits null when all options deselected', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()

      render(<SelectFilter {...defaultProps} onChange={onChange} value={['running']} isMulti={true} />)

      const toggle = screen.getByText('1 selected')
      await user.click(toggle)

      const runningOption = screen.getByText('Running')
      await user.click(runningOption)

      expect(onChange).toHaveBeenLastCalledWith(null)
    })

    it('keeps dropdown open in multi-select mode', async () => {
      const user = userEvent.setup()

      render(<SelectFilter {...defaultProps} isMulti={true} />)

      const toggle = screen.getByText('0 selected')
      await user.click(toggle)

      const runningOption = screen.getByText('Running')
      await user.click(runningOption)

      // Dropdown should stay open
      expect(screen.getByText('Failed')).toBeInTheDocument()
      expect(screen.getByText('Pending')).toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('renders select component', () => {
      render(<SelectFilter {...defaultProps} />)

      // Verify select renders by checking for toggle button
      expect(screen.getByText('Select status')).toBeInTheDocument()
    })
  })
})
