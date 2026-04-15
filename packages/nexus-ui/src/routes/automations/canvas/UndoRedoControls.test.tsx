import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReactFlowProvider } from '@xyflow/react'
import type { ReactElement } from 'react'
import { describe, expect, it, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { useWorkflowStore } from '../../../stores/useWorkflowStore'
import type { Activity, WorkflowDefinition } from '../../../stores/workflowStoreTypes'

import { UndoRedoControls } from './UndoRedoControls'

function makeWorkflow(name: string, activities: Activity[] = []): WorkflowDefinition {
  return {
    schema_version: '2.0.0',
    name,
    description: '',
    triggers: [],
    workflow: { activities },
  }
}

function renderWithFlow(ui: ReactElement) {
  return render(<ReactFlowProvider>{ui}</ReactFlowProvider>)
}

function seedAndChange() {
  useWorkflowStore.getState().loadWorkflowWithEdges(makeWorkflow('initial'), [])
  useWorkflowStore.getState().updateWorkflow((wf) => ({ ...wf, name: 'changed' }))
}

describe('UndoRedoControls', () => {
  beforeEach(() => {
    useWorkflowStore.setState({
      currentWorkflow: null,
      workflowVersion: 0,
      edges: [],
      nodePositions: {},
      _positionUndoVersion: 0,
      _temporalBatchPending: false,
    })
    useWorkflowStore.temporal.getState().resume()
    useWorkflowStore.temporal.getState().clear()
  })

  // --- Rendering ---

  it('renders undo and redo buttons', () => {
    renderWithFlow(<UndoRedoControls />)

    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Redo' })).toBeInTheDocument()
  })

  it('disables both buttons when there is no history', () => {
    renderWithFlow(<UndoRedoControls />)

    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled()
  })

  it('enables undo after a store change', () => {
    seedAndChange()
    renderWithFlow(<UndoRedoControls />)

    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled()
  })

  // --- Interactions ---

  it('clicking undo restores previous state and enables redo', async () => {
    const user = userEvent.setup()
    seedAndChange()

    const { rerender } = renderWithFlow(<UndoRedoControls />)

    await user.click(screen.getByRole('button', { name: 'Undo' }))

    expect(useWorkflowStore.getState().currentWorkflow?.name).toBe('initial')

    rerender(
      <ReactFlowProvider>
        <UndoRedoControls />
      </ReactFlowProvider>
    )

    expect(screen.getByRole('button', { name: 'Redo' })).toBeEnabled()
  })

  it('clicking redo reapplies the undone change', async () => {
    const user = userEvent.setup()
    seedAndChange()
    useWorkflowStore.temporal.getState().undo()

    const { rerender } = renderWithFlow(<UndoRedoControls />)

    await user.click(screen.getByRole('button', { name: 'Redo' }))

    expect(useWorkflowStore.getState().currentWorkflow?.name).toBe('changed')

    rerender(
      <ReactFlowProvider>
        <UndoRedoControls />
      </ReactFlowProvider>
    )

    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled()
  })

  // --- Accessibility ---

  it('has no accessibility violations', async () => {
    const { container } = renderWithFlow(<UndoRedoControls />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations with history available', async () => {
    seedAndChange()
    const { container } = renderWithFlow(<UndoRedoControls />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
