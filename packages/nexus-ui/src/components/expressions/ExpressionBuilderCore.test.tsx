import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { createDefaultCondition, createDefaultGroup } from '../../utils/expressions/defaults'

import { ExpressionBuilderCore } from './ExpressionBuilderCore'
import { prepareRootNode } from './prepareRootNode'

describe('prepareRootNode', () => {
  it('wraps a condition node in a group', () => {
    const condition = createDefaultCondition()
    const expression = { root: condition }

    const result = prepareRootNode(expression)

    // Destructured to avoid testing-library/no-node-access false-positive on `.children`
    const { children: resultChildren } = result
    expect(result.type).toBe('group')
    expect(resultChildren).toHaveLength(1)
    expect(resultChildren[0]).toBe(condition)
    expect(result.operator).toBe('AND')
  })

  it('returns a group node as-is', () => {
    const group = createDefaultGroup('OR')
    const expression = { root: group }

    const result = prepareRootNode(expression)

    expect(result).toBe(group)
    expect(result.type).toBe('group')
    expect(result.operator).toBe('OR')
  })

  it('creates a default group when root is null', () => {
    const result = prepareRootNode({ root: null })

    // Destructured to avoid testing-library/no-node-access false-positive on `.children`
    const { children: resultChildren } = result
    expect(result.type).toBe('group')
    expect(result.operator).toBe('AND')
    expect(resultChildren).toHaveLength(1)
    expect(resultChildren[0].type).toBe('condition')
  })
})

describe('ExpressionBuilderCore', () => {
  it('renders with empty value in visual mode', () => {
    const onChange = vi.fn()
    render(<ExpressionBuilderCore value="" onChange={onChange} />)

    expect(screen.getByLabelText('Expression editor mode')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add condition' })).toBeInTheDocument()
  })

  it('renders mode selector with visual and raw options', () => {
    const onChange = vi.fn()
    render(<ExpressionBuilderCore value="" onChange={onChange} />)

    const modeSelect = screen.getByLabelText('Expression editor mode')
    expect(modeSelect).toHaveValue('visual')

    // Check options exist
    expect(screen.getByRole('option', { name: 'Visual expression builder' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Custom expression' })).toBeInTheDocument()
  })

  it('parses valid expression and renders in visual mode', () => {
    const onChange = vi.fn()
    render(<ExpressionBuilderCore value="${input.age >= 18}" onChange={onChange} />)

    expect(screen.getByLabelText('Expression editor mode')).toHaveValue('visual')
    expect(screen.getByRole('button', { name: 'Add condition' })).toBeInTheDocument()
  })

  it('starts in raw mode for unparseable expression', () => {
    const onChange = vi.fn()
    render(<ExpressionBuilderCore value="${invalid syntax" onChange={onChange} />)

    expect(screen.getByLabelText('Expression editor mode')).toHaveValue('raw')
  })

  it('switches from visual to raw mode', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ExpressionBuilderCore value="" onChange={onChange} />)

    const modeSelect = screen.getByLabelText('Expression editor mode')
    await user.selectOptions(modeSelect, 'raw')

    await waitFor(() => {
      expect(screen.getByLabelText('Raw expression')).toBeInTheDocument()
    })
  })

  it('switches from raw to visual mode', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ExpressionBuilderCore value="${input.age >= 18}" onChange={onChange} />)

    // Start in visual mode
    const modeSelect = screen.getByLabelText('Expression editor mode')

    // Switch to raw
    await user.selectOptions(modeSelect, 'raw')
    await waitFor(() => {
      expect(screen.getByLabelText('Raw expression')).toBeInTheDocument()
    })

    // Switch back to visual
    await user.selectOptions(modeSelect, 'visual')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add condition' })).toBeInTheDocument()
    })
  })

  it('updates field in visual mode', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ExpressionBuilderCore value="" onChange={onChange} />)

    const fieldInputs = screen.getAllByPlaceholderText('Enter or drag and drop value')
    await user.type(fieldInputs[0], 'test')

    // Field should update
    expect(fieldInputs[0]).toHaveValue('test')
  })

  it('updates raw text when typing', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ExpressionBuilderCore value="${test}" onChange={onChange} />)

    // Switch to raw mode
    const modeSelect = screen.getByLabelText('Expression editor mode')
    await user.selectOptions(modeSelect, 'raw')

    const rawInput = await screen.findByLabelText('Raw expression')
    await user.clear(rawInput)
    await user.type(rawInput, 'updated')

    // Should show typed text
    expect(rawInput).toHaveValue('updated')
  })

  it('serializes visual expression when switching to raw mode', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ExpressionBuilderCore value="${input.age} >= 18" onChange={onChange} />)

    // Switch to raw mode
    const modeSelect = screen.getByLabelText('Expression editor mode')
    await user.selectOptions(modeSelect, 'raw')

    const rawInput = await screen.findByLabelText('Raw expression')
    expect(rawInput).toHaveValue('${input.age} >= 18')
  })

  it('handles external value change', async () => {
    const onChange = vi.fn()
    const { rerender } = render(<ExpressionBuilderCore value="" onChange={onChange} />)

    // Update value externally
    rerender(<ExpressionBuilderCore value="${input.score > 50}" onChange={onChange} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add condition' })).toBeInTheDocument()
    })
  })

  it('does not emit change when value prop changes to same value', () => {
    const onChange = vi.fn()
    const { rerender } = render(<ExpressionBuilderCore value="${input.age >= 18}" onChange={onChange} />)

    onChange.mockClear()

    // Re-render with same value
    rerender(<ExpressionBuilderCore value="${input.age >= 18}" onChange={onChange} />)

    // Should not call onChange for external update
    expect(onChange).not.toHaveBeenCalled()
  })

  it('renders with placeholder in raw mode', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ExpressionBuilderCore value="" onChange={onChange} placeholder="Custom placeholder" />)

    const modeSelect = screen.getByLabelText('Expression editor mode')
    await user.selectOptions(modeSelect, 'raw')

    expect(await screen.findByPlaceholderText('Custom placeholder')).toBeInTheDocument()
  })

  it('renders with error prop', () => {
    const onChange = vi.fn()
    render(<ExpressionBuilderCore value="" onChange={onChange} error={true} />)

    expect(screen.getByRole('button', { name: 'Add condition' })).toBeInTheDocument()
  })

  it('renders with custom id', () => {
    const onChange = vi.fn()
    render(<ExpressionBuilderCore value="" onChange={onChange} id="custom-builder-id" />)

    // Get the outermost group (ExpressionBuilderCore container)
    expect(screen.getByRole('group', { name: 'Expression builder' })).toHaveAttribute('id', 'custom-builder-id')
  })

  it('renders with aria-labelledby', () => {
    const onChange = vi.fn()
    render(<ExpressionBuilderCore value="" onChange={onChange} aria-labelledby="custom-label" />)

    // Get the outermost group by the custom label
    const groups = screen.getAllByRole('group')
    const builderGroup = groups.find((g) => g.hasAttribute('aria-labelledby'))
    expect(builderGroup).toBeDefined()
    expect(builderGroup).toHaveAttribute('aria-labelledby', 'custom-label')
    expect(builderGroup).not.toHaveAttribute('aria-label')
  })

  it('renders with default aria-label when no aria-labelledby', () => {
    const onChange = vi.fn()
    render(<ExpressionBuilderCore value="" onChange={onChange} />)

    expect(screen.getByRole('group', { name: 'Expression builder' })).toBeInTheDocument()
  })

  it('adds condition in visual mode', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ExpressionBuilderCore value="" onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Add condition' }))

    // Should have multiple conditions now
    const fieldInputs = screen.getAllByPlaceholderText('Enter or drag and drop value')
    expect(fieldInputs.length).toBeGreaterThan(1)
  })

  it('adds group in visual mode', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ExpressionBuilderCore value="" onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Add group' }))

    // Should have nested group (at level 1, so it will have Group label)
    const groupLabels = screen.getAllByText('Group')
    expect(groupLabels.length).toBeGreaterThan(0)
  })

  it('removes condition when only one left creates default condition', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ExpressionBuilderCore value="${input.age >= 18}" onChange={onChange} />)

    // Add another condition first
    await user.click(screen.getByRole('button', { name: 'Add condition' }))

    // Find and click remove button
    const removeButtons = screen.getAllByRole('button', { name: 'Remove condition' })
    await user.click(removeButtons[0])

    // Should still have one condition (default)
    const fieldInputs = screen.getAllByPlaceholderText('Enter or drag and drop value')
    expect(fieldInputs.length).toBeGreaterThan(0)
  })

  it('wraps single condition in group for consistent UI', () => {
    const onChange = vi.fn()
    render(<ExpressionBuilderCore value="${input.age >= 18}" onChange={onChange} />)

    // Should render group wrapper
    expect(screen.getByRole('button', { name: 'Add condition' })).toBeInTheDocument()
  })

  it('handles empty expression in visual mode', () => {
    const onChange = vi.fn()
    render(<ExpressionBuilderCore value="" onChange={onChange} />)

    // Should render default empty group
    expect(screen.getByRole('button', { name: 'Add condition' })).toBeInTheDocument()
  })

  it('changes operator in visual mode', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ExpressionBuilderCore value="" onChange={onChange} />)

    // Add another condition to show operator selector
    await user.click(screen.getByRole('button', { name: 'Add condition' }))

    const operatorSelect = screen.getByLabelText('Logical operator')
    expect(operatorSelect).toHaveValue('AND')

    await user.selectOptions(operatorSelect, 'OR')

    // Should update to OR
    expect(operatorSelect).toHaveValue('OR')
  })

  it('allows switching to visual mode with invalid raw expression', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ExpressionBuilderCore value="" onChange={onChange} />)

    // Switch to raw
    const modeSelect = screen.getByLabelText('Expression editor mode')
    await user.selectOptions(modeSelect, 'raw')

    // Enter invalid expression
    const rawInput = await screen.findByLabelText('Raw expression')
    await user.type(rawInput, 'invalid')

    // Switch back to visual - should show default empty group
    await user.selectOptions(modeSelect, 'visual')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add condition' })).toBeInTheDocument()
    })
  })
})
