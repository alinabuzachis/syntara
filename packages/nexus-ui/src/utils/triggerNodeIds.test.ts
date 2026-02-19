import { describe, expect, it } from 'vitest'

import { MenuNodeType } from '../constants'

import { buildTriggerNodeId, parseTriggerIndex, resolveFlowNodeId } from './triggerNodeIds'

describe('triggerNodeIds', () => {
  it('builds trigger node ids', () => {
    expect(buildTriggerNodeId(2)).toBe('trigger-2')
  })

  it('parses trigger index from node id', () => {
    expect(parseTriggerIndex('trigger-5')).toBe(5)
    expect(parseTriggerIndex('task-1')).toBeUndefined()
  })

  it('returns undefined for invalid trigger ids', () => {
    expect(parseTriggerIndex('trigger-')).toBeUndefined()
    expect(parseTriggerIndex('trigger-abc')).toBeUndefined()
  })

  it('parses zero index', () => {
    expect(parseTriggerIndex('trigger-0')).toBe(0)
  })

  it('resolves flow node id for trigger and activity', () => {
    expect(resolveFlowNodeId({ nodeId: 'task-1', nodeType: MenuNodeType.ACTIVITY })).toBe('task-1')
    expect(resolveFlowNodeId({ nodeId: 'any', nodeType: MenuNodeType.TRIGGER, triggerIndex: 3 })).toBe('trigger-3')
  })
})
