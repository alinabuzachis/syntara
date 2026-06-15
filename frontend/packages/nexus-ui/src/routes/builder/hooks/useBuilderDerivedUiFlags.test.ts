import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { WorkflowDefinition } from '../../../stores/workflowStoreTypes'

import { useBuilderDerivedUiFlags } from './useBuilderDerivedUiFlags'

describe('useBuilderDerivedUiFlags', () => {
  const emptyWorkflow = {
    triggers: [],
    workflow: { activities: [] },
  } as unknown as WorkflowDefinition

  const workflowWithTrigger = {
    triggers: [{ id: 't1', type: 'manual_trigger', parameters: {} }],
    workflow: { activities: [] },
  } as unknown as WorkflowDefinition

  it('treats add step panel as open when workflow has no triggers or steps', () => {
    const { result } = renderHook(() => useBuilderDerivedUiFlags(emptyWorkflow, false, null))

    expect(result.current.hasNoWorkflowNodes).toBe(true)
    expect(result.current.isAddNodePanelOpen).toBe(true)
  })

  it('reflects addNodePanelOpen when workflow has nodes', () => {
    const { result } = renderHook(() => useBuilderDerivedUiFlags(workflowWithTrigger, true, null))

    expect(result.current.hasNoWorkflowNodes).toBe(false)
    expect(result.current.isAddNodePanelOpen).toBe(true)
  })

  it('reports panel closed when addNodePanelOpen is false and workflow has content', () => {
    const { result } = renderHook(() => useBuilderDerivedUiFlags(workflowWithTrigger, false, null))

    expect(result.current.isAddNodePanelOpen).toBe(false)
  })
})
