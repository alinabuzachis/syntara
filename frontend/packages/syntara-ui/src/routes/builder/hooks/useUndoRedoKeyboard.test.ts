import { renderHook } from '@testing-library/react'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'

import { useWorkflowStore } from '../../../stores/useWorkflowStore'
import type { Activity, WorkflowDefinition } from '../../../stores/workflowStoreTypes'

import { useUndoRedoKeyboard } from './useUndoRedoKeyboard'

function makeWorkflow(name: string, activities: Activity[] = []): WorkflowDefinition {
  return {
    schema_version: '2.0.0',
    name,
    description: '',
    triggers: [],
    workflow: { activities },
  }
}

function pressKey(key: string, opts: Partial<KeyboardEventInit> = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, ...opts })
  document.dispatchEvent(event)
}

function seedAndChange() {
  useWorkflowStore.getState().loadWorkflowWithEdges(makeWorkflow('initial'), [])
  useWorkflowStore.getState().updateWorkflow((wf) => ({ ...wf, name: 'changed' }))
}

describe('useUndoRedoKeyboard', () => {
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

  afterEach(() => {
    document.body.focus()
  })

  // --- Undo shortcuts ---

  it('undoes on Ctrl+Z', () => {
    seedAndChange()
    renderHook(() => useUndoRedoKeyboard())

    pressKey('z', { ctrlKey: true })

    expect(useWorkflowStore.getState().currentWorkflow?.name).toBe('initial')
  })

  it('undoes on Meta+Z (Mac)', () => {
    seedAndChange()
    renderHook(() => useUndoRedoKeyboard())

    pressKey('z', { metaKey: true })

    expect(useWorkflowStore.getState().currentWorkflow?.name).toBe('initial')
  })

  // --- Redo shortcuts ---

  it('redoes on Ctrl+Shift+Z', () => {
    seedAndChange()
    useWorkflowStore.temporal.getState().undo()
    renderHook(() => useUndoRedoKeyboard())

    pressKey('Z', { ctrlKey: true, shiftKey: true })

    expect(useWorkflowStore.getState().currentWorkflow?.name).toBe('changed')
  })

  it('redoes on Ctrl+Y', () => {
    seedAndChange()
    useWorkflowStore.temporal.getState().undo()
    renderHook(() => useUndoRedoKeyboard())

    pressKey('y', { ctrlKey: true })

    expect(useWorkflowStore.getState().currentWorkflow?.name).toBe('changed')
  })

  // --- Guards: shortcuts suppressed ---

  it('does not undo when the hook is disabled', () => {
    seedAndChange()
    renderHook(() => useUndoRedoKeyboard({ disabled: true }))

    pressKey('z', { ctrlKey: true })

    expect(useWorkflowStore.getState().currentWorkflow?.name).toBe('changed')
  })

  it.each(['input', 'textarea'] as const)('does not undo when focus is in a %s element', (tag) => {
    seedAndChange()
    renderHook(() => useUndoRedoKeyboard())

    const el = document.createElement(tag)
    document.body.appendChild(el)
    el.focus()

    pressKey('z', { ctrlKey: true })

    expect(useWorkflowStore.getState().currentWorkflow?.name).toBe('changed')
    document.body.removeChild(el)
  })

  it('does not trigger on plain Z without modifier key', () => {
    seedAndChange()
    renderHook(() => useUndoRedoKeyboard())

    pressKey('z')

    expect(useWorkflowStore.getState().currentWorkflow?.name).toBe('changed')
  })

  // --- Implementation details ---

  it('pauses temporal tracking during undo to prevent duplicate history entries', () => {
    seedAndChange()
    renderHook(() => useUndoRedoKeyboard())

    pressKey('z', { ctrlKey: true })

    expect(useWorkflowStore.temporal.getState().isTracking).toBe(false)
    expect(useWorkflowStore.getState().currentWorkflow?.name).toBe('initial')
  })

  it('removes event listener on unmount', () => {
    seedAndChange()
    const { unmount } = renderHook(() => useUndoRedoKeyboard())

    unmount()
    pressKey('z', { ctrlKey: true })

    expect(useWorkflowStore.getState().currentWorkflow?.name).toBe('changed')
  })
})
