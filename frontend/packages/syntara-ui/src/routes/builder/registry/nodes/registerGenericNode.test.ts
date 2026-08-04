import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RegistryNodeId } from '../../../../constants'
import { useWorkflowStore } from '../../../../stores/useWorkflowStore'
import { NodeRegistry } from '../NodeRegistry'

import registerGenericNode from './registerGenericNode'

vi.mock('../../../../stores/useWorkflowStore', () => ({
  useWorkflowStore: {
    getState: vi.fn(() => ({
      addActivity: vi.fn(),
    })),
  },
  createGenericActivity: vi.fn((id: string, name: string) => ({
    id,
    name,
    type: 'task' as const,
  })),
}))

describe('registerGenericNode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    NodeRegistry.unregister(RegistryNodeId.GENERIC)
  })

  it('registers the Generic step type in the NodeRegistry', () => {
    registerGenericNode()

    const registration = NodeRegistry.get(RegistryNodeId.GENERIC)
    expect(registration).toBeDefined()
    expect(registration?.id).toBe(RegistryNodeId.GENERIC)
    expect(registration?.label).toBe('Generic Step')
    expect(registration?.category).toBe('other')
    expect(registration?.description).toBe('Placeholder step — click to configure')
  })

  it('registers with enabled=false so it is hidden from AddNodePanel', () => {
    registerGenericNode()

    const registration = NodeRegistry.get(RegistryNodeId.GENERIC)
    expect(registration?.enabled).toBe(false)
  })

  it('registers with high order so it appears last', () => {
    registerGenericNode()

    const registration = NodeRegistry.get(RegistryNodeId.GENERIC)
    expect(registration?.order).toBe(1000)
  })

  it('registers with searchable keywords', () => {
    registerGenericNode()

    const registration = NodeRegistry.get(RegistryNodeId.GENERIC)
    expect(registration?.keywords).toEqual(expect.arrayContaining(['placeholder', 'generic', 'new', 'configure']))
  })

  it('onSubmit creates a generic activity and calls onSuccess', () => {
    const mockAddActivity = vi.fn()
    vi.mocked(useWorkflowStore.getState).mockReturnValue({
      addActivity: mockAddActivity,
    } as never)

    registerGenericNode()
    const registration = NodeRegistry.get(RegistryNodeId.GENERIC)
    const onSuccess = vi.fn()
    const onError = vi.fn()

    registration?.onSubmit({}, onSuccess, onError)

    expect(mockAddActivity).toHaveBeenCalled()
    expect(onSuccess).toHaveBeenCalledWith(expect.any(String))
    expect(onError).not.toHaveBeenCalled()
  })

  it('onSubmit handles thrown errors and calls onError', () => {
    vi.mocked(useWorkflowStore.getState).mockReturnValue({
      addActivity: vi.fn(() => {
        throw new Error('Store error')
      }),
    } as never)

    registerGenericNode()
    const registration = NodeRegistry.get(RegistryNodeId.GENERIC)
    const onSuccess = vi.fn()
    const onError = vi.fn()

    registration?.onSubmit({}, onSuccess, onError)

    expect(onError).toHaveBeenCalledWith('Store error')
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('onSubmit handles non-Error throws with generic message', () => {
    vi.mocked(useWorkflowStore.getState).mockReturnValue({
      addActivity: vi.fn(() => {
        throw Object.create(null) as Error
      }),
    } as never)

    registerGenericNode()
    const registration = NodeRegistry.get(RegistryNodeId.GENERIC)
    const onSuccess = vi.fn()
    const onError = vi.fn()

    registration?.onSubmit({}, onSuccess, onError)

    expect(onError).toHaveBeenCalledWith('Failed to add generic step')
    expect(onSuccess).not.toHaveBeenCalled()
  })
})
