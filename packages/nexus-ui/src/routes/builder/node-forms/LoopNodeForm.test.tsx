import { render, screen } from '@testing-library/react'
import { renderWithHeader } from './test-utils/renderWithHeader'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LoopNodeForm, type LoopFormData } from './LoopNodeForm'

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

      expect(screen.getByLabelText(/Type/i)).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /For each/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /While/i })).toBeInTheDocument()
    })

    it('renders forEach fields by default', () => {
      renderWithHeader(<LoopNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByLabelText(/Items expression/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Item variable/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Index variable/i)).toBeInTheDocument()
    })

    it('renders while fields when type is while', () => {
      renderWithHeader(<LoopNodeForm onSubmit={mockOnSubmit} initialData={{ type: 'while' }} />)

      expect(screen.getByRole('group', { name: /Expression builder/i })).toBeInTheDocument()
      expect(screen.getByLabelText(/Max iterations/i)).toBeInTheDocument()
    })
  })

  describe('forEach Submission', () => {
    it('submits forEach loop data', async () => {
      const user = userEvent.setup()
      renderWithHeader(<LoopNodeForm onSubmit={mockOnSubmit} />)

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
          type: 'forEach',
          items: 'myArray',
          itemVariable: 'element',
          indexVariable: 'i',
        })
      )
    })

    it('submits without logicType field', async () => {
      const user = userEvent.setup()
      renderWithHeader(<LoopNodeForm onSubmit={mockOnSubmit} />)

      await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Another Loop')
      await user.type(screen.getByPlaceholderText(/input.item_list/i), 'items')
      await user.click(screen.getByRole('button', { name: /Add node/i }))

      const submittedData = mockOnSubmit.mock.calls[0][0] as LoopFormData
      expect(submittedData).not.toHaveProperty('logicType')
      expect(submittedData.type).toBe('forEach')
    })

    it('cleans data for forEach (no condition or maxIterations)', async () => {
      const user = userEvent.setup()
      renderWithHeader(<LoopNodeForm onSubmit={mockOnSubmit} />)

      await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Clean Loop')
      await user.type(screen.getByPlaceholderText(/input.item_list/i), 'cleanItems')
      await user.click(screen.getByRole('button', { name: /Add node/i }))

      const submittedData = mockOnSubmit.mock.calls[0][0] as LoopFormData
      expect(submittedData).not.toHaveProperty('condition')
      expect(submittedData).not.toHaveProperty('maxIterations')
      expect(submittedData.items).toBe('cleanItems')
    })
  })

  describe('while Submission', () => {
    it('submits while loop data with maxIterations', async () => {
      const user = userEvent.setup()
      renderWithHeader(<LoopNodeForm onSubmit={mockOnSubmit} initialData={{ type: 'while' }} />)

      await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'While Loop')

      // Switch to raw mode and enter expression
      await user.selectOptions(screen.getByLabelText(/Expression editor mode/i), 'raw')
      const rawInput = screen.getByLabelText(/Raw expression/i)
      await user.click(rawInput)
      await user.paste('${x < 100}')

      await user.type(screen.getByLabelText(/Max iterations/i), '500')
      await user.click(screen.getByRole('button', { name: /Add node/i }))

      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'While Loop',
          type: 'while',
          condition: '${x < 100}',
          maxIterations: 500,
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

      await user.click(screen.getByRole('button', { name: /Add node/i }))

      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'while',
          condition: '${running}',
          maxIterations: undefined,
        })
      )
    })

    it('cleans data for while (no items, indexVariable, or itemVariable)', async () => {
      const user = userEvent.setup()
      renderWithHeader(<LoopNodeForm onSubmit={mockOnSubmit} initialData={{ type: 'while' }} />)

      await user.type(screen.getByPlaceholderText(/Enter activity name/i), 'Clean While')
      await user.selectOptions(screen.getByLabelText(/Expression editor mode/i), 'raw')
      const rawInput = screen.getByLabelText(/Raw expression/i)
      await user.click(rawInput)
      await user.paste('${done}')
      await user.click(screen.getByRole('button', { name: /Add node/i }))

      const submittedData = mockOnSubmit.mock.calls[0][0] as LoopFormData
      expect(submittedData).not.toHaveProperty('items')
      expect(submittedData).not.toHaveProperty('indexVariable')
      expect(submittedData).not.toHaveProperty('itemVariable')
      expect(submittedData.condition).toBe('${done}')
    })
  })

  describe('Type Switching', () => {
    it('switches from forEach to while and updates fields', async () => {
      const user = userEvent.setup()
      renderWithHeader(<LoopNodeForm onSubmit={mockOnSubmit} />)

      // Initially forEach
      expect(screen.getByLabelText(/Items expression/i)).toBeInTheDocument()

      // Switch to while
      await user.selectOptions(screen.getByLabelText(/Type/i), 'while')

      // Now should show while fields
      expect(screen.getByRole('group', { name: /Expression builder/i })).toBeInTheDocument()
      expect(screen.getByLabelText(/Max iterations/i)).toBeInTheDocument()
      expect(screen.queryByLabelText(/Items expression/i)).not.toBeInTheDocument()
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
      }

      renderWithHeader(<LoopNodeForm onSubmit={mockOnSubmit} initialData={initialData} />)

      expect(screen.getByPlaceholderText(/Enter activity name/i)).toHaveValue('Existing While')
      expect(screen.getByLabelText(/Max iterations/i)).toHaveValue(999)
    })
  })

  describe('Default Values', () => {
    it('defaults to forEach type', () => {
      renderWithHeader(<LoopNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByLabelText(/Type/i)).toHaveValue('forEach')
    })

    it('defaults indexVariable to "index"', () => {
      renderWithHeader(<LoopNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByPlaceholderText(/^index$/i)).toHaveValue('index')
    })

    it('defaults itemVariable to "item"', () => {
      renderWithHeader(<LoopNodeForm onSubmit={mockOnSubmit} />)

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
