import type { Activity } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import { validateNoGenericNodes } from './validateNoGenericNodes'

describe('validateNoGenericNodes', () => {
  it('returns no errors for workflow without generic nodes', () => {
    const activities: Activity[] = [
      { type: 'script', id: 'task-1', name: 'Normal Task', parameters: { language: 'python', code: 'print("hello")' } },
      {
        type: 'condition',
        id: 'condition-1',
        name: 'Check Status',
        parameters: { condition: '${output.status == "success"}' },
      },
    ]

    const errors = validateNoGenericNodes(activities)
    expect(errors).toEqual([])
  })

  it('returns error for generic node with __isGeneric in metadata', () => {
    const activities: Activity[] = [
      {
        type: 'script',
        id: 'generic-1',
        name: 'Placeholder',
        parameters: { language: 'python', code: '' },
        metadata: { __isGeneric: true },
      },
    ]

    const errors = validateNoGenericNodes(activities)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({
      id: 'generic-node-generic-1',
      severity: 'error',
      rule: 'no-generic-nodes',
      message: 'Placeholder step "Placeholder" must be configured before saving',
      nodeId: 'generic-1',
      suggestion: 'Click on the placeholder step to select a step type and configure it',
    })
  })

  it('returns error for generic node without name', () => {
    const activities: Activity[] = [
      {
        type: 'script',
        id: 'generic-1',
        name: '',
        parameters: { language: 'python', code: '' },
        metadata: { __isGeneric: true },
      },
    ]

    const errors = validateNoGenericNodes(activities)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe('Placeholder step "Untitled" must be configured before saving')
  })

  it('returns multiple errors for multiple generic nodes', () => {
    const activities: Activity[] = [
      {
        type: 'script',
        id: 'generic-1',
        name: 'First Placeholder',
        parameters: { language: 'python', code: '' },
        metadata: { __isGeneric: true },
      },
      {
        type: 'script',
        id: 'normal-1',
        name: 'Normal Task',
        parameters: { language: 'python', code: 'print("hello")' },
      },
      {
        type: 'script',
        id: 'generic-2',
        name: 'Second Placeholder',
        parameters: { language: 'python', code: '' },
        metadata: { __isGeneric: true },
      },
    ]

    const errors = validateNoGenericNodes(activities)
    expect(errors).toHaveLength(2)
    expect(errors[0].nodeId).toBe('generic-1')
    expect(errors[1].nodeId).toBe('generic-2')
  })

  it('ignores nodes without __isGeneric in metadata', () => {
    const activities: Activity[] = [
      {
        type: 'script',
        id: 'task-1',
        name: 'Task with other metadata',
        parameters: { language: 'python', code: 'print("hello")' },
        metadata: { someOtherFlag: true },
      },
    ]

    const errors = validateNoGenericNodes(activities)
    expect(errors).toEqual([])
  })

  it('ignores nodes with __isGeneric set to false', () => {
    const activities: Activity[] = [
      {
        type: 'script',
        id: 'task-1',
        name: 'Not Generic',
        parameters: { language: 'python', code: 'print("hello")' },
        metadata: { __isGeneric: false },
      },
    ]

    const errors = validateNoGenericNodes(activities)
    expect(errors).toEqual([])
  })

  it('SECURITY: ignores __isGeneric in config (prevents API injection bypass)', () => {
    const activities: Activity[] = [
      {
        type: 'script',
        id: 'task-1',
        name: 'Malicious Activity',
        parameters: { language: 'python', code: 'print("hello")', __isGeneric: true },
        // No metadata.__isGeneric, so not actually generic
      },
    ]

    const errors = validateNoGenericNodes(activities)
    // Should not detect as generic because __isGeneric is in config, not metadata
    expect(errors).toEqual([])
  })

  it('handles empty workflow', () => {
    const errors = validateNoGenericNodes([])
    expect(errors).toEqual([])
  })
})
