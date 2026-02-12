import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { LogicNodeForm } from './LogicNodeForm'

describe('LogicNodeForm', () => {
  const mockOnSubmit = vi.fn()
  const mockOnCancel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders form with condition fields by default', () => {
    render(<LogicNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />)

    expect(screen.getByPlaceholderText(/Enter activity name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Logic type/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/output.status/i)).toBeInTheDocument()
  })

  it('submits condition form data', async () => {
    const user = userEvent.setup()
    render(<LogicNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />)

    await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Test Condition')
    await user.type(screen.getByPlaceholderText(/output.status/i), 'result > 0')
    await user.click(screen.getByRole('button', { name: /Add node/i }))

    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Test Condition',
        logicType: 'condition',
        condition: 'result > 0',
      })
    )
  })

  it('switches to loop type and shows loop fields', async () => {
    const user = userEvent.setup()
    render(<LogicNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />)

    await user.selectOptions(screen.getByLabelText(/Logic type/i), 'loop')

    expect(screen.getByLabelText(/^Type$/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/input.item_list/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/^item$/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/^index$/i)).toBeInTheDocument()
  })

  it('submits forEach loop data', async () => {
    const user = userEvent.setup()
    render(<LogicNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />)

    await user.selectOptions(screen.getByLabelText(/Logic type/i), 'loop')
    await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Test Loop')
    await user.type(screen.getByPlaceholderText(/input.item_list/i), 'myArray')
    await user.clear(screen.getByPlaceholderText(/^item$/i))
    await user.type(screen.getByPlaceholderText(/^item$/i), 'element')
    await user.clear(screen.getByPlaceholderText(/^index$/i))
    await user.type(screen.getByPlaceholderText(/^index$/i), 'i')
    await user.click(screen.getByRole('button', { name: /Add node/i }))

    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Test Loop',
        logicType: 'loop',
        type: 'forEach',
        items: 'myArray',
        itemVariable: 'element',
        indexVariable: 'i',
      })
    )
  })

  it('switches to while loop and shows while fields', async () => {
    const user = userEvent.setup()
    render(<LogicNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />)

    await user.selectOptions(screen.getByLabelText(/Logic type/i), 'loop')
    await user.selectOptions(screen.getByLabelText(/^Type$/i), 'while')

    expect(screen.getByPlaceholderText(/counter < 10/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/1000/i)).toBeInTheDocument()
  })

  it('submits while loop data', async () => {
    const user = userEvent.setup()
    render(<LogicNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />)

    await user.selectOptions(screen.getByLabelText(/Logic type/i), 'loop')
    await user.selectOptions(screen.getByLabelText(/^Type$/i), 'while')
    await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'While Loop')
    await user.type(screen.getByPlaceholderText(/counter < 10/i), 'x < 100')
    await user.type(screen.getByPlaceholderText(/1000/i), '500')
    await user.click(screen.getByRole('button', { name: /Add node/i }))

    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'While Loop',
        logicType: 'loop',
        type: 'while',
        condition: 'x < 100',
        maxIterations: 500,
      })
    )
  })

  it('switches to converge type and shows converge fields', async () => {
    const user = userEvent.setup()
    render(<LogicNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />)

    await user.selectOptions(screen.getByLabelText(/Logic type/i), 'converge')

    expect(screen.getByPlaceholderText(/300/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/On timeout/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Aggregate outputs/i)).toBeInTheDocument()
    expect(screen.getByText(/Converge nodes wait/i)).toBeInTheDocument()
  })

  it('submits converge data', async () => {
    const user = userEvent.setup()
    render(<LogicNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />)

    await user.selectOptions(screen.getByLabelText(/Logic type/i), 'converge')
    await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Join Branches')
    await user.type(screen.getByPlaceholderText(/300/i), '600')
    await user.selectOptions(screen.getByLabelText(/On timeout/i), 'continue')
    await user.selectOptions(screen.getByLabelText(/Aggregate outputs/i), 'false')
    await user.click(screen.getByRole('button', { name: /Add node/i }))

    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Join Branches',
        logicType: 'converge',
        timeout: 600,
        onTimeout: 'continue',
        aggregateOutputs: false,
      })
    )
  })

  it('populates form with initial data for condition', () => {
    render(
      <LogicNodeForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        initialData={{
          name: 'Existing Condition',
          logicType: 'condition',
          condition: 'status == "active"',
        }}
      />
    )

    expect(screen.getByDisplayValue('Existing Condition')).toBeInTheDocument()
    expect(screen.getByDisplayValue('status == "active"')).toBeInTheDocument()
  })

  it('populates form with initial data for loop', () => {
    render(
      <LogicNodeForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        initialData={{
          name: 'Existing Loop',
          logicType: 'loop',
          type: 'forEach',
          items: 'items',
          itemVariable: 'obj',
          indexVariable: 'idx',
        }}
      />
    )

    expect(screen.getByDisplayValue('Existing Loop')).toBeInTheDocument()
    expect(screen.getByDisplayValue('items')).toBeInTheDocument()
    expect(screen.getByDisplayValue('obj')).toBeInTheDocument()
    expect(screen.getByDisplayValue('idx')).toBeInTheDocument()
  })

  it('populates form with initial data for converge', () => {
    render(
      <LogicNodeForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        initialData={{
          name: 'Existing Converge',
          logicType: 'converge',
          timeout: 1200,
          onTimeout: 'continue',
          aggregateOutputs: false,
        }}
      />
    )

    expect(screen.getByDisplayValue('Existing Converge')).toBeInTheDocument()
    expect(screen.getByDisplayValue('1200')).toBeInTheDocument()
  })

  it('uses custom submit button text when provided', () => {
    render(<LogicNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} submitButtonText="Update node" />)

    expect(screen.getByRole('button', { name: /Update node/i })).toBeInTheDocument()
  })

  it('cleans up data when switching between logic types', async () => {
    const user = userEvent.setup()
    render(<LogicNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />)

    // Fill condition
    await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Test')
    await user.type(screen.getByPlaceholderText(/output.status/i), 'my condition')

    // Switch to converge
    await user.selectOptions(screen.getByLabelText(/Logic type/i), 'converge')
    await user.click(screen.getByRole('button', { name: /Add node/i }))

    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        logicType: 'converge',
        // Condition should be undefined for converge
        condition: undefined,
      })
    )
  })

  it('handles while loop without maxIterations', async () => {
    const user = userEvent.setup()
    render(<LogicNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />)

    await user.selectOptions(screen.getByLabelText(/Logic type/i), 'loop')
    await user.selectOptions(screen.getByLabelText(/^Type$/i), 'while')
    await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Simple While')
    await user.type(screen.getByPlaceholderText(/counter < 10/i), 'running')
    await user.click(screen.getByRole('button', { name: /Add node/i }))

    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        logicType: 'loop',
        type: 'while',
        maxIterations: undefined,
      })
    )
  })
})
