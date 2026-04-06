import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LoopNodeForm, type LoopFormData } from './LoopNodeForm'
import { renderWithHeader } from './test-utils/renderWithHeader'

describe('LoopNodeForm', () => {
  const mockOnSubmit = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('renders name field', () => {
      renderWithHeader(<LoopNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByPlaceholderText(/Enter activity name/i)).toBeInTheDocument()
    })

    it('renders type selector', () => {
      renderWithHeader(<LoopNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByRole('combobox', { name: /Type/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /For each/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /While/i })).toBeInTheDocument()
    })

    it('renders while fields by default', () => {
      renderWithHeader(<LoopNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByRole('spinbutton', { name: /Max iterations/i })).toBeInTheDocument()
      expect(screen.getByRole('combobox', { name: /Behaviour when max iteration is reached/i })).toBeInTheDocument()
      expect(screen.getByRole('group', { name: /Expression builder/i })).toBeInTheDocument()
    })

    it('renders while fields when type is while', () => {
      renderWithHeader(<LoopNodeForm onSubmit={mockOnSubmit} initialData={{ type: 'while' }} />)

      expect(screen.getByRole('spinbutton', { name: /Max iterations/i })).toBeInTheDocument()
      expect(screen.getByRole('combobox', { name: /Behaviour when max iteration is reached/i })).toBeInTheDocument()
      expect(screen.getByRole('group', { name: /Expression builder/i })).toBeInTheDocument()
    })

    it('renders help icons for while loop parameters', () => {
      renderWithHeader(<LoopNodeForm onSubmit={mockOnSubmit} initialData={{ type: 'while' }} />)

      const helpButtons = screen.getAllByRole('button', { name: /help/i })
      // Should have 4 help buttons: loop type, max iterations, behavior, conditional expression
      expect(helpButtons.length).toBeGreaterThanOrEqual(4)
    })
  })

  describe('forEach Submission', () => {
    it('shows "Items expression is required" when submitting forEach with empty items', async () => {
      const user = userEvent.setup()
      renderWithHeader(<LoopNodeForm onSubmit={mockOnSubmit} initialData={{ type: 'forEach' }} />)

      await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Test Loop')
      await user.click(screen.getByRole('button', { name: /Add step/i }))

      await waitFor(() => {
        expect(screen.getByText('Items expression is required')).toBeInTheDocument()
      })
      expect(mockOnSubmit).not.toHaveBeenCalled()
    })

    it('submits forEach loop data', async () => {
      const user = userEvent.setup()
      renderWithHeader(<LoopNodeForm onSubmit={mockOnSubmit} initialData={{ type: 'forEach' }} />)

      await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Test Loop')
      await user.type(screen.getByPlaceholderText(/input.item_list/i), 'myArray')
      await user.clear(screen.getByPlaceholderText(/^item$/i))
      await user.type(screen.getByPlaceholderText(/^item$/i), 'element')
      await user.clear(screen.getByPlaceholderText(/^index$/i))
      await user.type(screen.getByPlaceholderText(/^index$/i), 'i')
      await user.click(screen.getByRole('button', { name: /Add step/i }))

      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Loop',
          type: 'forEach',
          items: 'myArray',
          itemVariable: 'element',
          indexVariable: 'i',
        })
      )
    })

    it('submits without logicType field', async () => {
      const user = userEvent.setup()
      renderWithHeader(<LoopNodeForm onSubmit={mockOnSubmit} initialData={{ type: 'forEach' }} />)

      await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Another Loop')
      await user.type(screen.getByPlaceholderText(/input.item_list/i), 'items')
      await user.click(screen.getByRole('button', { name: /Add step/i }))

      const submittedData = mockOnSubmit.mock.calls[0][0] as LoopFormData
      expect(submittedData).not.toHaveProperty('logicType')
      expect(submittedData.type).toBe('forEach')
    })

    it('cleans data for forEach (no condition or maxIterations)', async () => {
      const user = userEvent.setup()
      renderWithHeader(<LoopNodeForm onSubmit={mockOnSubmit} initialData={{ type: 'forEach' }} />)

      await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Clean Loop')
      await user.type(screen.getByPlaceholderText(/input.item_list/i), 'cleanItems')
      await user.click(screen.getByRole('button', { name: /Add step/i }))

      const submittedData = mockOnSubmit.mock.calls[0][0] as LoopFormData
      expect(submittedData).not.toHaveProperty('condition')
      expect(submittedData).not.toHaveProperty('maxIterations')
      expect(submittedData.items).toBe('cleanItems')
    })
  })

  describe('while Submission', () => {
    it('shows "Conditional expression is required" when submitting while with empty condition', async () => {
      const user = userEvent.setup()
      renderWithHeader(<LoopNodeForm onSubmit={mockOnSubmit} initialData={{ type: 'while' }} />)

      await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'While Loop')
      await user.click(screen.getByRole('button', { name: /Add step/i }))

      await waitFor(() => {
        expect(screen.getByText('Conditional expression is required')).toBeInTheDocument()
      })
      expect(mockOnSubmit).not.toHaveBeenCalled()
    })

    it('submits while loop data with all optional parameters', async () => {
      const user = userEvent.setup()
      renderWithHeader(<LoopNodeForm onSubmit={mockOnSubmit} initialData={{ type: 'while' }} />)

      await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'While Loop')

      await user.type(screen.getByRole('spinbutton', { name: /Max iterations/i }), '500')
      await user.selectOptions(
        screen.getByRole('combobox', { name: /Behaviour when max iteration is reached/i }),
        'fail'
      )

      // Switch to raw mode and enter expression
      await user.selectOptions(screen.getByLabelText(/Expression editor mode/i), 'raw')
      const rawInput = screen.getByLabelText(/Raw expression/i)
      await user.click(rawInput)
      await user.paste('${x < 100}')

      await user.click(screen.getByRole('button', { name: /Add step/i }))

      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'While Loop',
          type: 'while',
          condition: '${x < 100}',
          maxIterations: 500,
          maxIterationsBehavior: 'fail',
        })
      )
    })

    it('submits while loop data with only maxIterations', async () => {
      const user = userEvent.setup()
      renderWithHeader(<LoopNodeForm onSubmit={mockOnSubmit} initialData={{ type: 'while' }} />)

      await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Max Iterations Loop')

      // Switch to raw mode and enter expression
      await user.selectOptions(screen.getByLabelText(/Expression editor mode/i), 'raw')
      const rawInput = screen.getByLabelText(/Raw expression/i)
      await user.click(rawInput)
      await user.paste('${x < 100}')

      await user.type(screen.getByRole('spinbutton', { name: /Max iterations/i }), '60')
      await user.click(screen.getByRole('button', { name: /Add step/i }))

      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'while',
          condition: '${x < 100}',
          maxIterations: 60,
        })
      )
    })

    it('submits while loop data without maxIterations', async () => {
      const user = userEvent.setup()
      renderWithHeader(<LoopNodeForm onSubmit={mockOnSubmit} initialData={{ type: 'while' }} />)

      await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Simple While')

      // Switch to raw mode and enter expression
      await user.selectOptions(screen.getByLabelText(/Expression editor mode/i), 'raw')
      const rawInput = screen.getByLabelText(/Raw expression/i)
      await user.click(rawInput)
      await user.paste('${running}')

      await user.click(screen.getByRole('button', { name: /Add step/i }))

      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'while',
          condition: '${running}',
          maxIterations: undefined,
        })
      )
    }, 10_000)

    it('cleans data for while (no items, indexVariable, or itemVariable)', async () => {
      const user = userEvent.setup()
      renderWithHeader(<LoopNodeForm onSubmit={mockOnSubmit} initialData={{ type: 'while' }} />)

      await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Clean While')
      await user.selectOptions(screen.getByLabelText(/Expression editor mode/i), 'raw')
      const rawInput = screen.getByLabelText(/Raw expression/i)
      await user.click(rawInput)
      await user.paste('${done}')
      await user.click(screen.getByRole('button', { name: /Add step/i }))

      const submittedData = mockOnSubmit.mock.calls[0][0] as LoopFormData
      expect(submittedData).not.toHaveProperty('items')
      expect(submittedData).not.toHaveProperty('indexVariable')
      expect(submittedData).not.toHaveProperty('itemVariable')
      expect(submittedData.condition).toBe('${done}')
    })

    it('excludes undefined optional while parameters from submission', async () => {
      const user = userEvent.setup()
      renderWithHeader(<LoopNodeForm onSubmit={mockOnSubmit} initialData={{ type: 'while' }} />)

      await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Minimal While')
      await user.selectOptions(screen.getByLabelText(/Expression editor mode/i), 'raw')
      const rawInput = screen.getByLabelText(/Raw expression/i)
      await user.click(rawInput)
      await user.paste('${active}')
      await user.click(screen.getByRole('button', { name: /Add step/i }))

      const submittedData = mockOnSubmit.mock.calls[0][0] as LoopFormData
      expect(submittedData.maxIterations).toBeUndefined()
      expect(submittedData.maxIterationsBehavior).toBe('continue') // Default value from UI
    })

    it('submits behavior selection', async () => {
      const user = userEvent.setup()
      renderWithHeader(<LoopNodeForm onSubmit={mockOnSubmit} initialData={{ type: 'while' }} />)

      await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Fail Behavior')
      await user.selectOptions(
        screen.getByRole('combobox', { name: /Behaviour when max iteration is reached/i }),
        'fail'
      )
      await user.selectOptions(screen.getByLabelText(/Expression editor mode/i), 'raw')
      const rawInput = screen.getByLabelText(/Raw expression/i)
      await user.click(rawInput)
      await user.paste('${running}')
      await user.click(screen.getByRole('button', { name: /Add step/i }))

      const submittedData = mockOnSubmit.mock.calls[0][0] as LoopFormData
      expect(submittedData.maxIterationsBehavior).toBe('fail')
    })

    it('rejects invalid maxIterations values (negative, zero, decimal)', async () => {
      const user = userEvent.setup()
      renderWithHeader(<LoopNodeForm onSubmit={mockOnSubmit} initialData={{ type: 'while' }} />)

      await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Invalid Max Loop')
      await user.selectOptions(screen.getByLabelText(/Expression editor mode/i), 'raw')
      const rawInput = screen.getByLabelText(/Raw expression/i)
      await user.click(rawInput)
      await user.paste('${running}')

      const maxIterationsInput = screen.getByRole('spinbutton', { name: /Max iterations/i })

      // Test negative value - schema rejects, submit is not called
      await user.clear(maxIterationsInput)
      await user.type(maxIterationsInput, '-1')
      await user.click(screen.getByRole('button', { name: /Add step/i }))
      expect(mockOnSubmit).not.toHaveBeenCalled()

      mockOnSubmit.mockClear()

      // Test zero value - schema rejects, submit is not called
      await user.clear(maxIterationsInput)
      await user.type(maxIterationsInput, '0')
      await user.click(screen.getByRole('button', { name: /Add step/i }))
      expect(mockOnSubmit).not.toHaveBeenCalled()

      mockOnSubmit.mockClear()

      // Test decimal value - schema rejects, submit is not called
      await user.clear(maxIterationsInput)
      await user.type(maxIterationsInput, '3.5')
      await user.click(screen.getByRole('button', { name: /Add step/i }))
      expect(mockOnSubmit).not.toHaveBeenCalled()
    })
  })

  describe('Type Switching', () => {
    it('switches from while to forEach and updates fields', async () => {
      const user = userEvent.setup()
      renderWithHeader(<LoopNodeForm onSubmit={mockOnSubmit} />)

      // Initially while
      expect(screen.getByRole('group', { name: /Expression builder/i })).toBeInTheDocument()

      // Switch to forEach
      await user.selectOptions(screen.getByRole('combobox', { name: /Type/i }), 'forEach')

      // Now should show forEach fields
      expect(screen.getByLabelText(/Items expression/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Item variable/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Index variable/i)).toBeInTheDocument()
      expect(screen.queryByRole('group', { name: /Expression builder/i })).not.toBeInTheDocument()
    })
  })

  describe('Initial Data', () => {
    it('pre-populates forEach form with initialData', () => {
      const initialData: Partial<LoopFormData> = {
        name: 'Existing Loop',
        type: 'forEach',
        items: '${myItems}',
        itemVariable: 'elem',
        indexVariable: 'idx',
      }

      renderWithHeader(<LoopNodeForm onSubmit={mockOnSubmit} initialData={initialData} />)

      expect(screen.getByPlaceholderText(/Enter activity name/i)).toHaveValue('Existing Loop')
      expect(screen.getByPlaceholderText(/input.item_list/i)).toHaveValue('${myItems}')
      expect(screen.getByPlaceholderText(/^item$/i)).toHaveValue('elem')
      expect(screen.getByPlaceholderText(/^index$/i)).toHaveValue('idx')
    })

    it('pre-populates while form with initialData', () => {
      const initialData: Partial<LoopFormData> = {
        name: 'Existing While',
        type: 'while',
        condition: '${count < 10}',
        maxIterations: 999,
        maxIterationsBehavior: 'fail',
      }

      renderWithHeader(<LoopNodeForm onSubmit={mockOnSubmit} initialData={initialData} />)

      expect(screen.getByPlaceholderText(/Enter activity name/i)).toHaveValue('Existing While')
      expect(screen.getByRole('spinbutton', { name: /Max iterations/i })).toHaveValue(999)
      expect(screen.getByRole('combobox', { name: /Behaviour when max iteration is reached/i })).toHaveValue('fail')
    })
  })

  describe('Default Values', () => {
    it('defaults to while type', () => {
      renderWithHeader(<LoopNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByRole('combobox', { name: /Type/i })).toHaveValue('while')
    })

    it('defaults indexVariable to "index" for forEach', () => {
      renderWithHeader(<LoopNodeForm onSubmit={mockOnSubmit} initialData={{ type: 'forEach' }} />)

      expect(screen.getByPlaceholderText(/^index$/i)).toHaveValue('index')
    })

    it('defaults itemVariable to "item" for forEach', () => {
      renderWithHeader(<LoopNodeForm onSubmit={mockOnSubmit} initialData={{ type: 'forEach' }} />)

      expect(screen.getByPlaceholderText(/^item$/i)).toHaveValue('item')
    })
  })

  describe('Header Content', () => {
    it('calls onHeaderContentChange with name field', () => {
      const mockOnHeaderContentChange = vi.fn()
      render(<LoopNodeForm onSubmit={mockOnSubmit} onHeaderContentChange={mockOnHeaderContentChange} />)

      expect(mockOnHeaderContentChange).toHaveBeenCalledWith(expect.anything())
    })
  })
})
