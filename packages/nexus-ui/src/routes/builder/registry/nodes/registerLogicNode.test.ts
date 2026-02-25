import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockAddActivity,
  mockBatchAddActivitiesAndEdges,
  mockCreateConditionActivity,
  mockCreateConvergeActivity,
  mockCreateGenericActivity,
  mockCreateLoopActivity,
  mockRegister,
} = vi.hoisted(() => ({
  mockAddActivity: vi.fn(),
  mockBatchAddActivitiesAndEdges: vi.fn(),
  mockCreateConditionActivity: vi.fn((id: string, name: string, condition: string) => ({
    type: 'condition',
    id,
    name,
    condition,
  })),
  mockCreateConvergeActivity: vi.fn((id: string, name: string, config?: Record<string, unknown>) => ({
    type: 'converge',
    id,
    name,
    config,
  })),
  mockCreateGenericActivity: vi.fn((id: string, name: string, msg?: string) => ({ type: 'task', id, name, msg })),
  mockCreateLoopActivity: vi.fn((id: string, name: string, type: string, opts?: Record<string, unknown>) => ({
    type: 'loop',
    id,
    name,
    loopType: type,
    ...opts,
  })),
  mockRegister: vi.fn(),
}))

vi.mock('../../../../stores/useWorkflowStore', () => ({
  createConditionActivity: mockCreateConditionActivity,
  createConvergeActivity: mockCreateConvergeActivity,
  createGenericActivity: mockCreateGenericActivity,
  createLoopActivity: mockCreateLoopActivity,
  useWorkflowStore: {
    getState: vi.fn(() => ({
      addActivity: mockAddActivity,
      edges: [],
      batchAddActivitiesAndEdges: mockBatchAddActivitiesAndEdges,
    })),
  },
}))

vi.mock('../../utils/nodeNaming', () => ({
  getDefaultNodeBaseName: vi.fn(() => 'Converge'),
  getNodeDisplayName: vi.fn((_base: unknown, name?: string) => name ?? 'Converge'),
}))

vi.mock('../helpers/nodeTemplates', () => ({
  createCustomNode: vi.fn((config: Record<string, unknown>, handler: (...args: unknown[]) => void) => ({
    ...config,
    onSubmit: handler,
  })),
}))

vi.mock('../NodeRegistry', () => ({
  NodeRegistry: { register: mockRegister },
}))

import registerLogicNode from './registerLogicNode'

function getHandler() {
  const definition = mockRegister.mock.calls[0][0]
  return definition.onSubmit as (
    data: Record<string, unknown>,
    onSuccess: (id?: string) => void,
    onError: (err: string) => void
  ) => void
}

describe('registerLogicNode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    registerLogicNode()
  })

  describe('Converge', () => {
    it('calls onError when strategy is missing', () => {
      const onSuccess = vi.fn()
      const onError = vi.fn()
      getHandler()({ logicType: 'converge', name: 'Test' }, onSuccess, onError)

      expect(onError).toHaveBeenCalledWith('Continue when criteria is required')
      expect(onSuccess).not.toHaveBeenCalled()
    })

    it('calls createConvergeActivity and onSuccess for valid strategy all', () => {
      const onSuccess = vi.fn()
      const onError = vi.fn()
      getHandler()({ logicType: 'converge', name: 'Join All', strategy: 'all' }, onSuccess, onError)

      expect(mockCreateConvergeActivity).toHaveBeenCalledWith(
        expect.stringMatching(/^logic_\d+_[a-z0-9]+$/),
        'Join All',
        expect.objectContaining({ strategy: 'all' })
      )
      expect(mockAddActivity).toHaveBeenCalled()
      expect(onSuccess).toHaveBeenCalledWith(expect.stringMatching(/^logic_\d+_[a-z0-9]+$/))
      expect(onError).not.toHaveBeenCalled()
    })

    it('passes timeout and onTimeout to factory for strategy all with timeout', () => {
      const onSuccess = vi.fn()
      const onError = vi.fn()
      getHandler()(
        {
          logicType: 'converge',
          name: 'Join',
          strategy: 'all',
          timeout: 3600,
          onTimeout: 'continue',
        },
        onSuccess,
        onError
      )

      expect(mockCreateConvergeActivity).toHaveBeenCalledWith(
        expect.any(String),
        'Join',
        expect.objectContaining({
          strategy: 'all',
          timeout: 3600,
          onTimeout: 'continue',
        })
      )
      expect(onSuccess).toHaveBeenCalled()
    })

    it('calls onError when strategy any is missing requiredPathCount', () => {
      const onSuccess = vi.fn()
      const onError = vi.fn()
      getHandler()(
        {
          logicType: 'converge',
          name: 'Join Any',
          strategy: 'any',
          remainingBehavior: 'cancel',
        },
        onSuccess,
        onError
      )

      expect(onError).toHaveBeenCalledWith(
        'Required path count must be at least 1 when using "Any branches reach this node"'
      )
      expect(onSuccess).not.toHaveBeenCalled()
    })

    it('calls onError when strategy any is missing remainingBehavior', () => {
      const onSuccess = vi.fn()
      const onError = vi.fn()
      getHandler()(
        {
          logicType: 'converge',
          name: 'Join Any',
          strategy: 'any',
          requiredPathCount: 2,
        },
        onSuccess,
        onError
      )

      expect(onError).toHaveBeenCalledWith(
        'Behavior of remaining nodes is required when using "Any branches reach this node"'
      )
      expect(onSuccess).not.toHaveBeenCalled()
    })

    it('calls createConvergeActivity and onSuccess for strategy any with all required fields', () => {
      const onSuccess = vi.fn()
      const onError = vi.fn()
      getHandler()(
        {
          logicType: 'converge',
          name: 'Join Any',
          strategy: 'any',
          requiredPathCount: 2,
          remainingBehavior: 'cancel',
        },
        onSuccess,
        onError
      )

      expect(mockCreateConvergeActivity).toHaveBeenCalledWith(
        expect.any(String),
        'Join Any',
        expect.objectContaining({
          strategy: 'any',
          requiredPathCount: 2,
          remainingBehavior: 'cancel',
        })
      )
      expect(mockAddActivity).toHaveBeenCalled()
      expect(onSuccess).toHaveBeenCalled()
      expect(onError).not.toHaveBeenCalled()
    })
  })

  describe('Condition', () => {
    it('calls onError when condition is missing', () => {
      const onSuccess = vi.fn()
      const onError = vi.fn()
      getHandler()({ logicType: 'condition', name: 'Check' }, onSuccess, onError)

      expect(onError).toHaveBeenCalledWith('Conditional expression is required')
      expect(onSuccess).not.toHaveBeenCalled()
    })

    it('calls createConditionActivity and onSuccess for valid condition', () => {
      const onSuccess = vi.fn()
      const onError = vi.fn()
      getHandler()({ logicType: 'condition', name: 'Check', condition: 'x > 0' }, onSuccess, onError)

      expect(mockCreateConditionActivity).toHaveBeenCalledWith(
        expect.stringMatching(/^logic_\d+_[a-z0-9]+$/),
        'Check',
        'x > 0'
      )
      expect(mockAddActivity).toHaveBeenCalled()
      expect(onSuccess).toHaveBeenCalled()
      expect(onError).not.toHaveBeenCalled()
    })
  })

  describe('Loop', () => {
    it('calls onError when forEach is missing items', () => {
      const onSuccess = vi.fn()
      const onError = vi.fn()
      getHandler()({ logicType: 'loop', type: 'forEach', name: 'Loop' }, onSuccess, onError)

      expect(onError).toHaveBeenCalledWith('Items expression is required for forEach loop')
      expect(onSuccess).not.toHaveBeenCalled()
    })

    it('calls onError when while is missing condition', () => {
      const onSuccess = vi.fn()
      const onError = vi.fn()
      getHandler()({ logicType: 'loop', type: 'while', name: 'While Loop' }, onSuccess, onError)

      expect(onError).toHaveBeenCalledWith('Conditional expression is required for while loop')
      expect(onSuccess).not.toHaveBeenCalled()
    })
  })

  describe('Invalid logicType', () => {
    it('calls onError for invalid logicType', () => {
      const onSuccess = vi.fn()
      const onError = vi.fn()
      getHandler()({ logicType: 'invalid', name: 'Bad' } as unknown as Record<string, unknown>, onSuccess, onError)

      expect(onError).toHaveBeenCalledWith('Invalid logic type')
      expect(onSuccess).not.toHaveBeenCalled()
    })
  })
})
