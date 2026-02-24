import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { cloneElement, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { secondsToTimeUnits, timeUnitsToSeconds } from '../utils/timeUtils'

import { LogicNodeForm, type LogicFormData } from './LogicNodeForm'

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
    expect(screen.queryByRole('switch', { name: /Timeout/i })).not.toBeInTheDocument()
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
    expect(screen.queryByRole('switch', { name: /Timeout/i })).not.toBeInTheDocument()
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

    expect(screen.getByLabelText(/Continue when criteria/i)).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /Timeout/i })).toBeInTheDocument()
    expect(screen.queryByText(/Timeout action/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Aggregate outputs/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Converge nodes wait/i)).not.toBeInTheDocument()
  })

  it('submits converge data without timeout when toggle is off', async () => {
    const user = userEvent.setup()
    renderWithHeader(
      <LogicNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} initialData={{ logicType: 'converge' }} />
    )

    await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Join Branches')
    await user.selectOptions(screen.getByLabelText(/Continue when criteria/i), 'all')
    await user.click(screen.getByRole('button', { name: /Add node/i }))

    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Join Branches',
        logicType: 'converge',
        strategy: 'all',
        timeout: undefined,
        onTimeout: undefined,
      })
    )
  })

  it('submits converge data with timeout when toggle is on', async () => {
    const user = userEvent.setup()
    renderWithHeader(
      <LogicNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} initialData={{ logicType: 'converge' }} />
    )

    await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Join Branches')
    await user.selectOptions(screen.getByLabelText(/Continue when criteria/i), 'all')
    await user.click(screen.getByRole('switch', { name: /Timeout/i }))
    await user.type(screen.getByLabelText(/Minute\(s\)/i), '10')
    await user.click(screen.getByRole('button', { name: /Select timeout action|Fail/i }))
    await user.click(screen.getByRole('option', { name: /Continue with partial data/i }))
    await user.click(screen.getByRole('button', { name: /Add node/i }))

    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Join Branches',
        logicType: 'converge',
        strategy: 'all',
        timeout: 600,
        onTimeout: 'continue',
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
          strategy: 'any',
          timeoutEnabled: true,
          timeoutMinutes: 20,
          onTimeout: 'continue',
        }}
      />
    )

    expect(screen.getByDisplayValue('Existing Converge')).toBeInTheDocument()
    expect(screen.getByLabelText(/Continue when criteria/i)).toHaveValue('any')
    expect(screen.getByRole('switch', { name: /Timeout/i })).toBeChecked()
    expect(screen.getByDisplayValue('20')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Continue with partial data/i })).toBeInTheDocument()
  })

  it('populates form with initial data for converge strategy any and optional fields', () => {
    renderWithHeader(
      <LogicNodeForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        initialData={{
          name: 'Existing Converge Any',
          logicType: 'converge',
          strategy: 'any',
          requiredPathCount: 3,
          remainingBehavior: 'cancel',
        }}
      />
    )

    expect(screen.getByDisplayValue('Existing Converge Any')).toBeInTheDocument()
    expect(screen.getByLabelText(/Required path count/i)).toHaveValue(3)
    expect(screen.getByLabelText(/Behavior of remaining nodes/i)).toHaveValue('cancel')
  })

  it('does not show required path count or remaining behavior when strategy is all', () => {
    renderWithHeader(
      <LogicNodeForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        initialData={{ logicType: 'converge', strategy: 'all' }}
      />
    )

    expect(screen.queryByLabelText(/Required path count/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Behavior of remaining nodes/i)).not.toBeInTheDocument()
  })

  it('shows required path count and remaining behavior when strategy is any', () => {
    renderWithHeader(
      <LogicNodeForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        initialData={{ logicType: 'converge', strategy: 'any' }}
      />
    )

    expect(screen.getByLabelText(/Required path count/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Behavior of remaining nodes/i)).toBeInTheDocument()
  })

  it('pre-populates required path count with 1 when strategy any is first selected', () => {
    renderWithHeader(
      <LogicNodeForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        initialData={{ logicType: 'converge', strategy: 'any' }}
      />
    )

    const requiredPathCountInput = screen.getByLabelText(/Required path count/i)
    expect(requiredPathCountInput).toHaveValue(1)
  })

  it('shows placeholder for remaining behavior when no value selected', () => {
    renderWithHeader(
      <LogicNodeForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        initialData={{ logicType: 'converge', strategy: 'any' }}
      />
    )

    const remainingBehaviorSelect = screen.getByLabelText(/Behavior of remaining nodes/i)
    expect(remainingBehaviorSelect).toHaveValue('')
    expect(screen.getByText(/Select behavior of remaining nodes/i)).toBeInTheDocument()
  })

  it('submits converge data with "any" strategy and all required fields', async () => {
    const user = userEvent.setup()
    renderWithHeader(
      <LogicNodeForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        initialData={{ logicType: 'converge', strategy: 'any' }}
      />
    )

    await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Join Any')
    await user.selectOptions(screen.getByLabelText(/Behavior of remaining nodes/i), 'cancel')
    await user.click(screen.getByRole('button', { name: /Add node/i }))

    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Join Any',
        logicType: 'converge',
        strategy: 'any',
        requiredPathCount: 1,
        remainingBehavior: 'cancel',
      })
    )
  })

  it('blocks submit when strategy is any but remaining behavior not selected', async () => {
    const user = userEvent.setup()
    renderWithHeader(
      <LogicNodeForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        initialData={{ logicType: 'converge', strategy: 'any' }}
      />
    )

    await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Join Any')
    // requiredPathCount defaults to 1, but remainingBehavior is empty
    await user.click(screen.getByRole('button', { name: /Add node/i }))

    expect(mockOnSubmit).not.toHaveBeenCalled()
  })

  it('blocks submit when strategy is any but required path count is invalid', async () => {
    const user = userEvent.setup()
    renderWithHeader(
      <LogicNodeForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        initialData={{ logicType: 'converge', strategy: 'any' }}
      />
    )

    await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Join Any')
    await user.clear(screen.getByLabelText(/Required path count/i))
    await user.type(screen.getByLabelText(/Required path count/i), '0')
    await user.selectOptions(screen.getByLabelText(/Behavior of remaining nodes/i), 'continue')
    await user.click(screen.getByRole('button', { name: /Add node/i }))

    expect(mockOnSubmit).not.toHaveBeenCalled()
  })

  it('prevents submit when converge strategy is not selected', async () => {
    const user = userEvent.setup()
    renderWithHeader(
      <LogicNodeForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        initialData={{ logicType: 'converge', strategy: '' } as unknown as Partial<LogicFormData>}
      />
    )

    await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Test Converge')
    await user.click(screen.getByRole('button', { name: /Add node/i }))

    expect(mockOnSubmit).not.toHaveBeenCalled()
  })

  it('uses custom submit button text when provided', () => {
    renderWithHeader(<LogicNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} submitButtonText="Update node" />)

    expect(screen.getByRole('button', { name: /Update node/i })).toBeInTheDocument()
  })

  it("'any' option is disabled in continue when criteria dropdown", () => {
    renderWithHeader(
      <LogicNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} initialData={{ logicType: 'converge' }} />
    )

    const anyOption = screen.getByRole('option', { name: /Any branches reach this node/i })
    expect(anyOption).toBeDisabled()
  })

  describe('helpers', () => {
    describe('secondsToTimeUnits', () => {
      it('converts 3600 seconds to 1 hour', () => {
        expect(secondsToTimeUnits(3600)).toEqual({ days: 0, hours: 1, minutes: 0, seconds: 0 })
      })

      it('converts 86400 seconds to 1 day', () => {
        expect(secondsToTimeUnits(86400)).toEqual({ days: 1, hours: 0, minutes: 0, seconds: 0 })
      })

      it('converts 3661 seconds to 1 hour, 1 minute, 1 second', () => {
        expect(secondsToTimeUnits(3661)).toEqual({ days: 0, hours: 1, minutes: 1, seconds: 1 })
      })

      it('converts 0 seconds to all zeros', () => {
        expect(secondsToTimeUnits(0)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 })
      })
    })

    describe('timeUnitsToSeconds', () => {
      it('converts days, hours, minutes, seconds to total seconds', () => {
        expect(timeUnitsToSeconds(30, 5, 2, 1)).toBe(30 + 300 + 7200 + 86400)
      })

      it('returns 0 when called with no arguments', () => {
        expect(timeUnitsToSeconds()).toBe(0)
      })
    })
  })

  it('timeout toggle saves all four time units', async () => {
    const user = userEvent.setup()
    renderWithHeader(
      <LogicNodeForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} initialData={{ logicType: 'converge' }} />
    )

    await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Converge With Timeout')
    await user.selectOptions(screen.getByLabelText(/Continue when criteria/i), 'all')
    await user.click(screen.getByRole('switch', { name: /Timeout/i }))
    await user.type(screen.getByLabelText(/Day\(s\)/i), '1')
    await user.type(screen.getByLabelText(/Hour\(s\)/i), '2')
    await user.type(screen.getByLabelText(/Minute\(s\)/i), '3')
    await user.type(screen.getByLabelText(/Second\(s\)/i), '4')
    await user.click(screen.getByRole('button', { name: /Select timeout action|Fail/i }))
    await user.click(screen.getByRole('option', { name: /Fail/i }))
    await user.click(screen.getByRole('button', { name: /Add node/i }))

    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Converge With Timeout',
        logicType: 'converge',
        strategy: 'all',
        timeout: 86400 + 7200 + 180 + 4,
        onTimeout: 'fail',
      })
    )
  })

  it('timeout state persists correctly on edit with all time unit fields pre-populated', () => {
    renderWithHeader(
      <LogicNodeForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        initialData={{
          logicType: 'converge',
          timeoutEnabled: true,
          timeoutDays: 1,
          timeoutHours: 2,
          timeoutMinutes: 3,
          timeoutSeconds: 4,
        }}
      />
    )

    expect(screen.getByLabelText(/Day\(s\)/i)).toHaveValue(1)
    expect(screen.getByLabelText(/Hour\(s\)/i)).toHaveValue(2)
    expect(screen.getByLabelText(/Minute\(s\)/i)).toHaveValue(3)
    expect(screen.getByLabelText(/Second\(s\)/i)).toHaveValue(4)
  })
})
