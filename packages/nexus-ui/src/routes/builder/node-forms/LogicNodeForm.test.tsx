import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { cloneElement, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LogicNodeForm } from './LogicNodeForm'

function renderWithHeader(ui: ReactElement) {
  function Wrapper() {
    const [headerContent, setHeaderContent] = useState<ReactNode | null>(null)
    return (
      <>
        {headerContent}
        {cloneElement(ui as ReactElement<{ onHeaderContentChange?: (content: ReactNode | null) => void }>, {
          onHeaderContentChange: setHeaderContent,
        })}
      </>
    )
  }

  render(<Wrapper />)
}

describe('LogicNodeForm', () => {
  const mockOnSubmit = vi.fn()
  const mockOnCancel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders condition fields by default and hides loop/converge fields', () => {
    renderWithHeader(<LogicNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />)

    expect(screen.getByLabelText(/Condition expression/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/Items expression/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Timeout \(seconds\)/i)).not.toBeInTheDocument()
  })

  it('submits condition form data', async () => {
    const user = userEvent.setup()
    renderWithHeader(<LogicNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />)

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

  it('renders loop fields when initialData sets logicType to loop', () => {
    renderWithHeader(
      <LogicNodeForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        initialData={{ logicType: 'loop', type: 'forEach' }}
      />
    )

    expect(screen.getByLabelText(/Items expression/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Item variable/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Index variable/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/Timeout \(seconds\)/i)).not.toBeInTheDocument()
  })

  it('submits forEach loop data', async () => {
    const user = userEvent.setup()
    renderWithHeader(
      <LogicNodeForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        initialData={{ logicType: 'loop', type: 'forEach' }}
      />
    )

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

  it('renders while loop fields when initialData sets type to while', () => {
    renderWithHeader(
      <LogicNodeForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        initialData={{ logicType: 'loop', type: 'while' }}
      />
    )

    expect(screen.getByPlaceholderText(/counter < 10/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/1000/i)).toBeInTheDocument()
  })

  it('submits while loop data', async () => {
    const user = userEvent.setup()
    renderWithHeader(
      <LogicNodeForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        initialData={{ logicType: 'loop', type: 'while' }}
      />
    )

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

  it('submits while loop data without maxIterations', async () => {
    const user = userEvent.setup()
    renderWithHeader(
      <LogicNodeForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        initialData={{ logicType: 'loop', type: 'while' }}
      />
    )

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

  it('renders converge fields when initialData sets logicType to converge', () => {
    renderWithHeader(
      <LogicNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} initialData={{ logicType: 'converge' }} />
    )

    expect(screen.getByPlaceholderText(/300/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/On timeout/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Aggregate outputs/i)).toBeInTheDocument()
    expect(screen.getByText(/Converge nodes wait/i)).toBeInTheDocument()
  })

  it('submits converge data', async () => {
    const user = userEvent.setup()
    renderWithHeader(
      <LogicNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} initialData={{ logicType: 'converge' }} />
    )

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
    renderWithHeader(
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
    renderWithHeader(
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
    renderWithHeader(
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
    renderWithHeader(<LogicNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} submitButtonText="Update node" />)

    expect(screen.getByRole('button', { name: /Update node/i })).toBeInTheDocument()
  })
})
