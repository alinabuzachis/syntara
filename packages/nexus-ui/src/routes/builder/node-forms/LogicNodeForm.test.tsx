import { ActivityTypeEnum } from '@ansible/nexus-contracts'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LogicNodeForm, type LogicFormData } from './LogicNodeForm'
import { renderWithHeader } from './test-utils/renderWithHeader'

describe('LogicNodeForm', () => {
  const mockOnSubmit = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Delegation to specialized forms', () => {
    it('renders ConditionNodeForm when logicType is condition', () => {
      renderWithHeader(
        <LogicNodeForm
          onSubmit={mockOnSubmit}
          initialData={{
            logicType: ActivityTypeEnum.CONDITION,
            name: 'Test Condition',
            condition: '${x > 0}',
          }}
        />
      )

      // Verify ConditionNodeForm is rendered by checking for its unique elements
      expect(screen.getByRole('group', { name: /Expression builder/i })).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/Enter activity name/i)).toHaveValue('Test Condition')
    })

    it('renders LoopNodeForm when logicType is loop', () => {
      renderWithHeader(
        <LogicNodeForm
          onSubmit={mockOnSubmit}
          initialData={{
            logicType: ActivityTypeEnum.LOOP,
            name: 'Test Loop',
            type: 'forEach',
            items: '${items}',
          }}
        />
      )

      // Verify LoopNodeForm is rendered by checking for its unique elements
      expect(screen.getByPlaceholderText(/Enter activity name/i)).toHaveValue('Test Loop')
      expect(screen.getByLabelText(/^Type$/i)).toBeInTheDocument()
    })

    it('renders ConvergeNodeForm when logicType is converge', () => {
      renderWithHeader(
        <LogicNodeForm
          onSubmit={mockOnSubmit}
          initialData={{
            logicType: ActivityTypeEnum.CONVERGE,
            name: 'Test Converge',
            strategy: 'all',
          }}
        />
      )

      // Verify ConvergeNodeForm is rendered by checking for its unique elements
      expect(screen.getByPlaceholderText(/Enter activity name/i)).toHaveValue('Test Converge')
      expect(screen.getByLabelText(/Continue when/i)).toBeInTheDocument()
    })

    it('returns null when logicType is unknown', () => {
      const { container } = render(
        <LogicNodeForm
          onSubmit={mockOnSubmit}
          initialData={{
            logicType: 'unknown',
          }}
        />
      )

      expect(container.firstChild).toBeNull()
    })

    it('returns null when logicType is undefined', () => {
      const { container } = render(<LogicNodeForm onSubmit={mockOnSubmit} />)

      expect(container.firstChild).toBeNull()
    })
  })

  describe('Data mapping and submission', () => {
    it('maps condition data correctly and adds logicType on submit', async () => {
      const user = userEvent.setup()
      renderWithHeader(
        <LogicNodeForm
          onSubmit={mockOnSubmit}
          initialData={{
            logicType: ActivityTypeEnum.CONDITION,
            name: 'Initial Name',
            condition: '${initial}',
          }}
        />
      )

      // Clear and update name
      const nameInput = screen.getByPlaceholderText(/Enter activity name/i)
      await user.clear(nameInput)
      await user.type(nameInput, 'Updated Condition')

      // Update expression in raw mode
      await user.selectOptions(screen.getByLabelText(/Expression editor mode/i), 'raw')
      const rawInput = screen.getByLabelText(/Raw expression/i)
      await user.clear(rawInput)
      await user.paste('${x > 5}')

      await user.click(screen.getByRole('button', { name: /Add node/i }))

      expect(mockOnSubmit).toHaveBeenCalledWith({
        name: 'Updated Condition',
        condition: '${x > 5}',
        logicType: ActivityTypeEnum.CONDITION,
      })
    })

    it('maps loop data correctly and adds logicType on submit', async () => {
      const user = userEvent.setup()
      renderWithHeader(
        <LogicNodeForm
          onSubmit={mockOnSubmit}
          initialData={{
            logicType: ActivityTypeEnum.LOOP,
            name: 'Test Loop',
            type: 'forEach',
            items: '${items}',
            maxIterations: 10,
            indexVariable: 'i',
            itemVariable: 'item',
          }}
        />
      )

      // Update name
      const nameInput = screen.getByPlaceholderText(/Enter activity name/i)
      await user.clear(nameInput)
      await user.type(nameInput, 'Updated Loop')

      await user.click(screen.getByRole('button', { name: /Add node/i }))

      expect(mockOnSubmit).toHaveBeenCalled()
      const submittedData = mockOnSubmit.mock.calls[0][0] as LogicFormData
      expect(submittedData.logicType).toBe(ActivityTypeEnum.LOOP)
      expect(submittedData.name).toBe('Updated Loop')
      expect(submittedData.type).toBe('forEach')
    })

    it('maps converge data correctly and adds logicType on submit', async () => {
      const user = userEvent.setup()
      renderWithHeader(
        <LogicNodeForm
          onSubmit={mockOnSubmit}
          initialData={{
            logicType: ActivityTypeEnum.CONVERGE,
            name: 'Test Converge',
            strategy: 'all',
            timeoutEnabled: false,
          }}
        />
      )

      // Update name
      const nameInput = screen.getByPlaceholderText(/Enter activity name/i)
      await user.clear(nameInput)
      await user.type(nameInput, 'Updated Converge')

      await user.click(screen.getByRole('button', { name: /Add node/i }))

      expect(mockOnSubmit).toHaveBeenCalled()
      const submittedData = mockOnSubmit.mock.calls[0][0] as LogicFormData
      expect(submittedData.logicType).toBe(ActivityTypeEnum.CONVERGE)
      expect(submittedData.name).toBe('Updated Converge')
    })

    it('defaults loop type to forEach when not provided', () => {
      renderWithHeader(
        <LogicNodeForm
          onSubmit={mockOnSubmit}
          initialData={{
            logicType: ActivityTypeEnum.LOOP,
            name: 'Loop without type',
          }}
        />
      )

      // Verify forEach is selected by default
      expect(screen.getByLabelText(/^Type$/i)).toHaveValue('forEach')
    })
  })

  describe('Props propagation', () => {
    it('passes submitButtonText to specialized form', () => {
      renderWithHeader(
        <LogicNodeForm
          onSubmit={mockOnSubmit}
          submitButtonText="Custom Submit"
          initialData={{
            logicType: ActivityTypeEnum.CONDITION,
          }}
        />
      )

      expect(screen.getByRole('button', { name: /Custom Submit/i })).toBeInTheDocument()
    })
  })

  describe('Initial data mapping', () => {
    it('maps all condition fields from initialData', () => {
      renderWithHeader(
        <LogicNodeForm
          onSubmit={mockOnSubmit}
          initialData={{
            logicType: ActivityTypeEnum.CONDITION,
            name: 'Condition Node',
            condition: '${value > 10}',
          }}
        />
      )

      expect(screen.getByPlaceholderText(/Enter activity name/i)).toHaveValue('Condition Node')
    })

    it('maps all loop fields from initialData', () => {
      renderWithHeader(
        <LogicNodeForm
          onSubmit={mockOnSubmit}
          initialData={{
            logicType: ActivityTypeEnum.LOOP,
            name: 'Loop Node',
            type: 'while',
            condition: '${count < 5}',
            maxIterations: 100,
            indexVariable: 'idx',
            itemVariable: 'val',
          }}
        />
      )

      expect(screen.getByPlaceholderText(/Enter activity name/i)).toHaveValue('Loop Node')
      expect(screen.getByLabelText(/^Type$/i)).toHaveValue('while')
    })

    it('maps all converge fields from initialData', () => {
      renderWithHeader(
        <LogicNodeForm
          onSubmit={mockOnSubmit}
          initialData={{
            logicType: ActivityTypeEnum.CONVERGE,
            name: 'Converge Node',
            strategy: 'any',
            timeoutEnabled: true,
            timeoutSeconds: 30,
            timeoutMinutes: 5,
            timeoutHours: 1,
            timeoutDays: 0,
            timeout: 3930,
            onTimeout: 'fail',
            requiredPathCount: 2,
            remainingBehavior: 'cancel',
          }}
        />
      )

      expect(screen.getByPlaceholderText(/Enter activity name/i)).toHaveValue('Converge Node')
      expect(screen.getByLabelText(/Continue when/i)).toHaveValue('any')
    })
  })
})
