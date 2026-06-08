import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { createDefaultCondition } from '../../utils/expressions/defaults'
import type { ExpressionCondition as ExpressionConditionType } from '../../utils/expressions/types'

import { ExpressionCondition } from './ExpressionCondition'

function ControlledExpressionCondition({ initialCondition }: { initialCondition: ExpressionConditionType }) {
  const [condition, setCondition] = useState(initialCondition)
  return (
    <ExpressionCondition
      condition={condition}
      onChange={(updates) => setCondition((prev) => ({ ...prev, ...updates }))}
    />
  )
}

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

  it('renders all 14 operators with semantic grouping in dropdown', () => {
    const condition = createDefaultCondition()
    render(<ExpressionCondition {...defaultProps} condition={condition} />)

    const operatorSelect = screen.getByRole('combobox', { name: 'Comparison operator' })
    expect(operatorSelect).toBeInTheDocument()

    // Verify all 14 operators are present (no disabled separators)
    const options = within(operatorSelect).getAllByRole('option')
    expect(options).toHaveLength(14) // Only operators, no separators

    // Verify semantic optgroups are present with descriptive labels
    const optgroups = within(operatorSelect).queryAllByRole('group')
    expect(optgroups).toHaveLength(4)

    // Verify group labels
    const groupLabels = optgroups.map((group) => group.getAttribute('label'))
    expect(groupLabels).toEqual(['Comparison', 'String', 'Existence', 'Length'])

    // Spot check operators from each group
    const operatorNames = options.map((opt) => opt.textContent)
    expect(operatorNames).toContain('is equal to') // Comparison
    expect(operatorNames).toContain('is greater than') // Comparison
    expect(operatorNames).toContain('contains') // String
    expect(operatorNames).toContain('exists') // Existence
    expect(operatorNames).toContain('length is equal to') // Length
  })

  it('does not include removed negated operators (use NOT checkbox instead)', () => {
    const condition = createDefaultCondition()
    render(<ExpressionCondition {...defaultProps} condition={condition} />)

    const operatorSelect = screen.getByRole('combobox', { name: 'Comparison operator' })

    // Verify negated operators are NOT present (use NOT checkbox instead)
    expect(within(operatorSelect).queryByRole('option', { name: 'is not equal to' })).not.toBeInTheDocument()
    expect(within(operatorSelect).queryByRole('option', { name: 'does not contain' })).not.toBeInTheDocument()
    expect(within(operatorSelect).queryByRole('option', { name: 'does not start with' })).not.toBeInTheDocument()
    expect(within(operatorSelect).queryByRole('option', { name: 'does not end with' })).not.toBeInTheDocument()
    expect(within(operatorSelect).queryByRole('option', { name: 'does not match regex' })).not.toBeInTheDocument()
    expect(within(operatorSelect).queryByRole('option', { name: 'does not exist' })).not.toBeInTheDocument()
    expect(within(operatorSelect).queryByRole('option', { name: 'length is not equal to' })).not.toBeInTheDocument()
    expect(within(operatorSelect).queryByRole('option', { name: 'is not empty' })).not.toBeInTheDocument()
  })

  it('does not include removed Date/Time operators', () => {
    const condition = createDefaultCondition()
    render(<ExpressionCondition {...defaultProps} condition={condition} />)

    const operatorSelect = screen.getByRole('combobox', { name: 'Comparison operator' })

    // Verify Date/Time operators are NOT present
    expect(within(operatorSelect).queryByRole('option', { name: /is before$/i })).not.toBeInTheDocument()
    expect(within(operatorSelect).queryByRole('option', { name: /is after$/i })).not.toBeInTheDocument()
    expect(within(operatorSelect).queryByRole('option', { name: /is today/i })).not.toBeInTheDocument()
    expect(within(operatorSelect).queryByRole('option', { name: /is in the past/i })).not.toBeInTheDocument()
    expect(within(operatorSelect).queryByRole('option', { name: /is in the future/i })).not.toBeInTheDocument()
  })

  it('does not include removed Boolean operators', () => {
    const condition = createDefaultCondition()
    render(<ExpressionCondition {...defaultProps} condition={condition} />)

    const operatorSelect = screen.getByRole('combobox', { name: 'Comparison operator' })

    // Verify Boolean-specific operators are NOT present
    expect(within(operatorSelect).queryByRole('option', { name: 'is true' })).not.toBeInTheDocument()
    expect(within(operatorSelect).queryByRole('option', { name: 'is false' })).not.toBeInTheDocument()
  })

  it('shows error state on variable when error prop is true and variable is empty', () => {
    const condition = { ...createDefaultCondition(), variable: '' }
    render(<ExpressionCondition {...defaultProps} condition={condition} error={true} />)

    const fieldInputs = screen.getAllByPlaceholderText('Enter or drag and drop value')
    expect(fieldInputs[0]).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows error state on value when error prop is true and value is empty', () => {
    const condition = { ...createDefaultCondition(), value: '', operator: '==' as const } // Explicitly use binary operator
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
    const condition = { ...createDefaultCondition(), operator: '==' as const } // Explicitly use binary operator
    render(<ExpressionCondition {...defaultProps} condition={condition} />)

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

  describe('Operator Selection', () => {
    it('changes operator when user selects new option', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      const condition = createDefaultCondition()

      render(<ExpressionCondition {...defaultProps} condition={condition} onChange={onChange} />)

      const operatorSelect = screen.getByRole('combobox', { name: 'Comparison operator' })

      await user.selectOptions(operatorSelect, 'contains')

      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ operator: 'contains' }))
    })
  })

  describe('Value Field Visibility', () => {
    it('shows value field for binary operators (number category)', () => {
      const condition = { ...createDefaultCondition(), operator: '==' as const }
      render(<ExpressionCondition {...defaultProps} condition={condition} />)

      // Value field should be present for binary operators
      const inputs = screen.getAllByPlaceholderText('Enter or drag and drop value')
      expect(inputs).toHaveLength(2) // Field and Value
    })

    it('hides value field for object operators - exists', () => {
      const condition = { ...createDefaultCondition(), operator: 'exists' as const }
      render(<ExpressionCondition {...defaultProps} condition={condition} />)

      // Only Field input should be present, not Value
      const inputs = screen.getAllByPlaceholderText('Enter or drag and drop value')
      expect(inputs).toHaveLength(1) // Only Field

      // Verify the Value help button is not present
      expect(screen.queryByRole('button', { name: 'Value help' })).not.toBeInTheDocument()
    })

    it('hides value field for unary operators - exists with NOT checkbox', () => {
      const condition = { ...createDefaultCondition(), operator: 'exists' as const, negate: true }
      render(<ExpressionCondition {...defaultProps} condition={condition} />)

      const inputs = screen.getAllByPlaceholderText('Enter or drag and drop value')
      expect(inputs).toHaveLength(1) // Only Field (exists is unary, doesn't need value)
    })

    it('hides value field for object operators - isEmpty', () => {
      const condition = { ...createDefaultCondition(), operator: 'isEmpty' as const }
      render(<ExpressionCondition {...defaultProps} condition={condition} />)

      const inputs = screen.getAllByPlaceholderText('Enter or drag and drop value')
      expect(inputs).toHaveLength(1) // Only Field
    })

    it('hides value field for unary operators - isEmpty with NOT checkbox', () => {
      const condition = { ...createDefaultCondition(), operator: 'isEmpty' as const, negate: true }
      render(<ExpressionCondition {...defaultProps} condition={condition} />)

      const inputs = screen.getAllByPlaceholderText('Enter or drag and drop value')
      expect(inputs).toHaveLength(1) // Only Field (isEmpty is unary, doesn't need value even with NOT)
    })

    it('shows value field for string operators', () => {
      const condition = { ...createDefaultCondition(), operator: 'contains' as const }
      render(<ExpressionCondition {...defaultProps} condition={condition} />)

      // Value field should be present for binary string operators
      const inputs = screen.getAllByPlaceholderText('Enter or drag and drop value')
      expect(inputs).toHaveLength(2) // Field and Value
    })

    it('shows value field for binary array operators (length)', () => {
      const condition = { ...createDefaultCondition(), operator: 'lengthEqualTo' as const }
      render(<ExpressionCondition {...defaultProps} condition={condition} />)

      // Value field should be present for binary array operators
      const inputs = screen.getAllByPlaceholderText('Enter or drag and drop value')
      expect(inputs).toHaveLength(2) // Field and Value
    })

    it('hides value field for unary/existence operators', () => {
      const condition = { ...createDefaultCondition(), operator: 'isEmpty' as const }
      render(<ExpressionCondition {...defaultProps} condition={condition} />)

      // Value field should be hidden for unary/existence operators
      const inputs = screen.getAllByPlaceholderText('Enter or drag and drop value')
      expect(inputs).toHaveLength(1) // Only Field
    })

    it('hides value field when switching to unary operator', async () => {
      const user = userEvent.setup()
      const condition = { ...createDefaultCondition(), operator: '==' as const }
      render(<ControlledExpressionCondition initialCondition={condition} />)

      // Initially, value field should be present
      let inputs = screen.getAllByPlaceholderText('Enter or drag and drop value')
      expect(inputs).toHaveLength(2) // Field and Value

      // Switch to unary operator
      const operatorSelect = screen.getByRole('combobox', { name: 'Comparison operator' })
      await user.selectOptions(operatorSelect, 'exists')

      // Value field should be hidden now
      inputs = screen.getAllByPlaceholderText('Enter or drag and drop value')
      expect(inputs).toHaveLength(1) // Only Field
    })

    it('shows value field when switching from unary to binary operator', async () => {
      const user = userEvent.setup()
      const condition = { ...createDefaultCondition(), operator: 'exists' as const }
      render(<ControlledExpressionCondition initialCondition={condition} />)

      // Initially, value field should be hidden
      let inputs = screen.getAllByPlaceholderText('Enter or drag and drop value')
      expect(inputs).toHaveLength(1) // Only Field

      // Switch to binary operator
      const operatorSelect = screen.getByRole('combobox', { name: 'Comparison operator' })
      await user.selectOptions(operatorSelect, '==')

      // Value field should be shown now
      inputs = screen.getAllByPlaceholderText('Enter or drag and drop value')
      expect(inputs).toHaveLength(2) // Field and Value
    })
  })
})
