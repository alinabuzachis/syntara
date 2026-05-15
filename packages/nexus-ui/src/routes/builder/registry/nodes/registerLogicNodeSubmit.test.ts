import { ActivityTypeEnum } from '@ansible/nexus-contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockAddActivity = vi.fn()
const mockBatchAddActivitiesAndEdges = vi.fn()

vi.mock('../../../../stores/useWorkflowStore', () => ({
  createConditionActivity: vi.fn((_id: string, _name: string, condition: string) => ({
    type: ActivityTypeEnum.CONDITION,
    condition,
  })),
  createConvergeActivity: vi.fn((_id: string, _name: string, config: unknown) => ({
    type: ActivityTypeEnum.CONVERGE,
    config,
  })),
  createGenericActivity: vi.fn((id: string, name: string, msg: string) => ({
    type: 'task',
    id,
    name,
    msg,
  })),
  createLoopActivity: vi.fn((_id: string, _name: string, loopType: string, opts: unknown) => ({
    type: ActivityTypeEnum.LOOP,
    loopType,
    opts,
  })),
  useWorkflowStore: {
    getState: vi.fn(() => ({
      addActivity: mockAddActivity,
      edges: [],
      batchAddActivitiesAndEdges: mockBatchAddActivitiesAndEdges,
    })),
  },
}))

vi.mock('../../utils/nodeNaming', () => ({
  getDefaultNodeBaseName: vi.fn(() => 'base'),
  getNodeDisplayName: vi.fn((_base: string, name?: string) => name ?? 'base'),
}))

import {
  buildLogicStepName,
  generateSecureRandomId,
  submitConditionLogic,
  submitConvergeLogic,
  submitLoopLogic,
} from './registerLogicNodeSubmit'

describe('registerLogicNodeSubmit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('generateSecureRandomId', () => {
    it('returns a non-empty id when crypto is available', () => {
      const id = generateSecureRandomId()
      expect(id.length).toBeGreaterThan(0)
    })

    it('throws when getRandomValues is unavailable', () => {
      const original = globalThis.crypto
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: { getRandomValues: undefined },
      })
      try {
        expect(() => generateSecureRandomId()).toThrow(/Cryptographically secure random/)
      } finally {
        Object.defineProperty(globalThis, 'crypto', { configurable: true, value: original })
      }
    })
  })

  describe('buildLogicStepName', () => {
    it('builds display name from form data', () => {
      expect(
        buildLogicStepName({
          logicType: ActivityTypeEnum.CONDITION,
          name: 'My Branch',
        } as Parameters<typeof buildLogicStepName>[0])
      ).toBe('My Branch')
    })

    it('resolves converge label path', () => {
      expect(
        buildLogicStepName({
          logicType: ActivityTypeEnum.CONVERGE,
          name: 'Join',
        } as Parameters<typeof buildLogicStepName>[0])
      ).toBe('Join')
    })

    it('resolves loop label path', () => {
      expect(
        buildLogicStepName({
          logicType: ActivityTypeEnum.LOOP,
          name: 'Iter',
          type: 'while',
        } as Parameters<typeof buildLogicStepName>[0])
      ).toBe('Iter')
    })
  })

  describe('submitConditionLogic', () => {
    it('returns false and calls onError when condition missing', () => {
      const onError = vi.fn()
      expect(
        submitConditionLogic('id', 'n', { logicType: ActivityTypeEnum.CONDITION, name: 'x' } as never, onError)
      ).toBe(false)
      expect(onError).toHaveBeenCalledWith('Conditional expression is required')
      expect(mockAddActivity).not.toHaveBeenCalled()
    })

    it('returns true and adds activity when condition present', () => {
      const onError = vi.fn()
      expect(
        submitConditionLogic(
          'cid',
          'Cond',
          { logicType: ActivityTypeEnum.CONDITION, name: 'x', condition: 'true' } as never,
          onError
        )
      ).toBe(true)
      expect(mockAddActivity).toHaveBeenCalled()
      expect(onError).not.toHaveBeenCalled()
    })
  })

  describe('submitLoopLogic', () => {
    it('returns false when loop type is invalid', () => {
      const onError = vi.fn()
      const onSuccess = vi.fn()
      expect(
        submitLoopLogic({
          activityId: 'l1',
          name: 'L',
          data: { logicType: ActivityTypeEnum.LOOP, name: 'L', type: 'invalid' } as never,
          generateId: () => 'x',
          onSuccess,
          onError,
        })
      ).toBe(false)
      expect(onError).toHaveBeenCalledWith('Loop type must be forEach or while')
      expect(onSuccess).not.toHaveBeenCalled()
    })

    it('returns false when forEach missing items', () => {
      const onError = vi.fn()
      expect(
        submitLoopLogic({
          activityId: 'l1',
          name: 'L',
          data: { logicType: ActivityTypeEnum.LOOP, name: 'L', type: 'forEach' } as never,
          generateId: () => 'x',
          onSuccess: vi.fn(),
          onError,
        })
      ).toBe(false)
      expect(onError).toHaveBeenCalledWith('Items expression is required for forEach loop')
    })

    it('returns false when while missing condition', () => {
      const onError = vi.fn()
      expect(
        submitLoopLogic({
          activityId: 'l1',
          name: 'L',
          data: { logicType: ActivityTypeEnum.LOOP, name: 'L', type: 'while' } as never,
          generateId: () => 'x',
          onSuccess: vi.fn(),
          onError,
        })
      ).toBe(false)
      expect(onError).toHaveBeenCalledWith('Conditional expression is required for while loop')
    })

    it('returns true and batches activities for valid forEach loop', () => {
      const onSuccess = vi.fn()
      const onError = vi.fn()
      expect(
        submitLoopLogic({
          activityId: 'loop-1',
          name: 'Each',
          data: {
            logicType: ActivityTypeEnum.LOOP,
            name: 'Each',
            type: 'forEach',
            items: 'ctx.items',
          } as never,
          generateId: () => 'abc',
          onSuccess,
          onError,
        })
      ).toBe(true)
      expect(mockBatchAddActivitiesAndEdges).toHaveBeenCalled()
      expect(onSuccess).toHaveBeenCalledWith('loop-1')
      expect(onError).not.toHaveBeenCalled()
    })

    it('returns true for valid while loop', () => {
      const onSuccess = vi.fn()
      const onError = vi.fn()
      expect(
        submitLoopLogic({
          activityId: 'loop-2',
          name: 'While',
          data: {
            logicType: ActivityTypeEnum.LOOP,
            name: 'While',
            type: 'while',
            condition: 'true',
          } as never,
          generateId: () => 'xyz',
          onSuccess,
          onError,
        })
      ).toBe(true)
      expect(mockBatchAddActivitiesAndEdges).toHaveBeenCalled()
      expect(onSuccess).toHaveBeenCalledWith('loop-2')
    })
  })

  describe('submitConvergeLogic', () => {
    it('returns false when strategy missing', () => {
      const onError = vi.fn()
      expect(
        submitConvergeLogic('c1', 'C', { logicType: ActivityTypeEnum.CONVERGE, name: 'C' } as never, onError)
      ).toBe(false)
      expect(onError).toHaveBeenCalledWith('Continue when criteria is required')
    })

    it('returns false for strategy any with invalid requiredPathCount', () => {
      const onError = vi.fn()
      expect(
        submitConvergeLogic(
          'c1',
          'C',
          {
            logicType: ActivityTypeEnum.CONVERGE,
            name: 'C',
            strategy: 'any',
            requiredPathCount: 0,
          } as never,
          onError
        )
      ).toBe(false)
      expect(onError).toHaveBeenCalledWith(
        'Required path count must be at least 1 when using "Any branches reach this step"'
      )
    })

    it('returns true and adds activity for strategy all', () => {
      const onError = vi.fn()
      expect(
        submitConvergeLogic(
          'c1',
          'Join',
          { logicType: ActivityTypeEnum.CONVERGE, name: 'Join', strategy: 'all' } as never,
          onError
        )
      ).toBe(true)
      expect(mockAddActivity).toHaveBeenCalled()
      expect(onError).not.toHaveBeenCalled()
    })

    it('returns true for strategy any with required fields', () => {
      const onError = vi.fn()
      expect(
        submitConvergeLogic(
          'c2',
          'Any join',
          {
            logicType: ActivityTypeEnum.CONVERGE,
            name: 'Any join',
            strategy: 'any',
            requiredPathCount: 2,
            timeout: 60,
            onTimeout: 'fail',
          } as never,
          onError
        )
      ).toBe(true)
      expect(mockAddActivity).toHaveBeenCalled()
      expect(onError).not.toHaveBeenCalled()
    })
  })
})
