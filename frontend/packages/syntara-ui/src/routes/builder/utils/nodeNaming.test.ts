import { describe, expect, it, vi } from 'vitest'

import { getNodeDisplayName, getNodeDisplayNameForEdit } from './nodeNaming'

const mockWorkflowState = vi.hoisted(() => ({
  currentWorkflow: {
    triggers: [{ name: 'Trigger' }],
    workflow: {
      activities: [{ name: 'Script' }, { name: 'Script2' }],
    },
  },
}))

vi.mock('../../../stores/useWorkflowStore', () => ({
  useWorkflowStore: {
    getState: vi.fn(() => mockWorkflowState),
  },
}))

vi.mock('../../../utils/generateUUID', () => ({
  generateUUID: vi.fn(() => '00000000-0000-0000-0000-000000000000'),
}))

describe('nodeNaming', () => {
  it('generates unique names when requested name collides', () => {
    expect(getNodeDisplayName('Script', 'Script')).toBe('Script3')
  })

  it('generates unique names when base name collides', () => {
    expect(getNodeDisplayName('Script')).toBe('Script3')
  })

  it('uses random fallback when base name is blank', () => {
    expect(getNodeDisplayName('')).toBe('Node-00000000')
  })

  it('keeps current name on edit when unchanged', () => {
    expect(getNodeDisplayNameForEdit('Trigger', 'Trigger', 'Trigger')).toBe('Trigger')
  })

  it('avoids conflicts when editing to a new name', () => {
    expect(getNodeDisplayNameForEdit('Trigger', 'Script', 'Trigger')).toBe('Script3')
  })
})
