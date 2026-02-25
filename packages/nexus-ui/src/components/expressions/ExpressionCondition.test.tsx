import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { createDefaultCondition } from '../../utils/expressions/defaults'

import { ExpressionCondition } from './ExpressionCondition'

describe('ExpressionCondition', () => {
  const defaultProps = {
    condition: createDefaultCondition(),
    onChange: vi.fn(),
  }

  it('renders condition with all fields', () => {
    render(<ExpressionCondition {...defaultProps} />)

    // Check for field inputs using placeholders
    const inputs = screen.getAllByPlaceholderText('Enter or drag and drop value')
    expect(inputs).toHaveLength(2) // Field and Value inputs

    // Check for operator select - verify it exists with the default value
    const selects = screen.getAllByRole('combobox')
    const operatorSelect = selects.find((select) => (select as HTMLSelectElement).value === '==')
    expect(operatorSelect).toBeInTheDocument()
  })

  it('renders NOT checkbox', () => {
    render(<ExpressionCondition {...defaultProps} />)

    const notCheckbox = screen.getByRole('checkbox', { name: 'Negate condition' })
    expect(notCheckbox).toBeInTheDocument()
    expect(notCheckbox).not.toBeChecked()
  })

  it('shows NOT checkbox as checked when condition is negated', () => {
    const condition = { ...createDefaultCondition(), negate: true }
    render(<ExpressionCondition {...defaultProps} condition={condition} />)

    const notCheckbox = screen.getByRole('checkbox', { name: 'Negate condition' })
    expect(notCheckbox).toBeChecked()
  })

  it('calls onChange when NOT checkbox is toggled', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ExpressionCondition {...defaultProps} onChange={onChange} />)

    const notCheckbox = screen.getByRole('checkbox', { name: 'Negate condition' })
    await user.click(notCheckbox)

    expect(onChange).toHaveBeenCalledWith({ negate: true })
  })

  it('updates variable field', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ExpressionCondition {...defaultProps} onChange={onChange} />)

    const fieldInputs = screen.getAllByPlaceholderText('Enter or drag and drop value')
    await user.type(fieldInputs[0], 'input.age')

    expect(onChange).toHaveBeenCalled()
  })

  it('updates operator field', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const condition = { ...createDefaultCondition(), operator: '==' as const }
    render(<ExpressionCondition {...defaultProps} condition={condition} onChange={onChange} />)

    // Find all select elements - looking for the one with value "=="
    const selects = screen.getAllByRole('combobox')
    // Find the select that has the operator value
    const operatorSelect = selects.find((select) => (select as HTMLSelectElement).value === '==')

    if (!operatorSelect) {
      throw new Error('Could not find operator select')
    }

    await user.selectOptions(operatorSelect, '>')

    expect(onChange).toHaveBeenCalledWith({ operator: '>' })
  })

  it('updates value field', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ExpressionCondition {...defaultProps} onChange={onChange} />)

    const valueInputs = screen.getAllByPlaceholderText('Enter or drag and drop value')
    await user.type(valueInputs[1], '18')

    expect(onChange).toHaveBeenCalled()
  })

  it('shows remove button when onRemove is provided', () => {
    const onRemove = vi.fn()
    render(<ExpressionCondition {...defaultProps} onRemove={onRemove} />)

    expect(screen.getByRole('button', { name: 'Remove condition' })).toBeInTheDocument()
  })

  it('does not show remove button when onRemove is not provided', () => {
    render(<ExpressionCondition {...defaultProps} />)

    expect(screen.queryByRole('button', { name: 'Remove condition' })).not.toBeInTheDocument()
  })

  it('calls onRemove when remove button is clicked', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    render(<ExpressionCondition {...defaultProps} onRemove={onRemove} />)

    await user.click(screen.getByRole('button', { name: 'Remove condition' }))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('renders all comparison operators', () => {
    const condition = createDefaultCondition()
    render(<ExpressionCondition {...defaultProps} condition={condition} />)

    // Check all 6 operators are available with descriptive labels
    const operators = [
      '==   equal to',
      '!=   not equal to',
      '>   greater than',
      '<   less than',
      '>=   greater than or equal to',
      '<=   less than or equal to',
    ]
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(6)

    // Verify each operator label is present
    operators.forEach((label) => {
      expect(options.some((option) => option.textContent === label)).toBe(true)
    })
  })

  it('shows error state on variable when error prop is true and variable is empty', () => {
    const condition = { ...createDefaultCondition(), variable: '' }
    render(<ExpressionCondition {...defaultProps} condition={condition} error={true} />)

    const fieldInputs = screen.getAllByPlaceholderText('Enter or drag and drop value')
    expect(fieldInputs[0]).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows error state on value when error prop is true and value is empty', () => {
    const condition = { ...createDefaultCondition(), value: '' }
    render(<ExpressionCondition {...defaultProps} condition={condition} error={true} />)

    const valueInputs = screen.getAllByPlaceholderText('Enter or drag and drop value')
    expect(valueInputs[1]).toHaveAttribute('aria-invalid', 'true')
  })

  it('does not show error state when error prop is false', () => {
    const condition = { ...createDefaultCondition(), variable: '', value: '' }
    render(<ExpressionCondition {...defaultProps} condition={condition} error={false} />)

    const inputs = screen.getAllByPlaceholderText('Enter or drag and drop value')
    inputs.forEach((input) => {
      expect(input).not.toHaveAttribute('aria-invalid', 'true')
    })
  })

  it('opens field help popover on click', async () => {
    const user = userEvent.setup()
    render(<ExpressionCondition {...defaultProps} />)

    const helpButton = screen.getByRole('button', { name: 'Field help' })
    await user.click(helpButton)

    expect(await screen.findByText(/The data point you want to evaluate/)).toBeInTheDocument()
  })

  it('opens operator help popover on click', async () => {
    const user = userEvent.setup()
    render(<ExpressionCondition {...defaultProps} />)

    const helpButton = screen.getByRole('button', { name: 'Operator help' })
    await user.click(helpButton)

    expect(await screen.findByText(/The logical test to apply/)).toBeInTheDocument()
  })

  it('opens value help popover on click', async () => {
    const user = userEvent.setup()
    render(<ExpressionCondition {...defaultProps} />)

    const helpButton = screen.getByRole('button', { name: 'Value help' })
    await user.click(helpButton)

    expect(await screen.findByText(/The specific criteria you are testing against/)).toBeInTheDocument()
  })

  it('opens NOT help popover on click', async () => {
    const user = userEvent.setup()
    render(<ExpressionCondition {...defaultProps} />)

    const helpButton = screen.getByRole('button', { name: 'NOT operator help' })
    await user.click(helpButton)

    expect(await screen.findByText(/Inverse the logic of this specific condition/)).toBeInTheDocument()
  })
})
