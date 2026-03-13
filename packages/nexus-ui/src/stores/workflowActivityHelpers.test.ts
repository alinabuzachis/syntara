import { ActivityTypeEnum } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import {
  collectAllActivityIds,
  findActivityById,
  removeActivityFromList,
  updateActivityInList,
  reorderActivities,
} from './workflowActivityHelpers'
import type { Activity } from './workflowStoreTypes'

const task = (id: string): Activity =>
  ({ type: ActivityTypeEnum.TASK, id, name: id, task: { executor: 'script', config: {} } }) as Activity

const condition = (id: string, thenBranch: Activity[], elseBranch?: Activity[]): Activity =>
  ({
    type: ActivityTypeEnum.CONDITION,
    id,
    name: id,
    condition: 'true',
    // biome-ignore lint/suspicious/noThenProperty: `then` is part of the workflow condition schema
    then: thenBranch,
    else: elseBranch,
  }) as unknown as Activity

const loop = (id: string, doActivities: Activity[]): Activity =>
  ({
    type: ActivityTypeEnum.LOOP,
    id,
    name: id,
    loop: { type: 'forEach', items: 'items', do: doActivities },
  }) as unknown as Activity

const parallel = (id: string, branches: Activity[]): Activity =>
  ({ type: ActivityTypeEnum.PARALLEL, id, name: id, branches }) as Activity

const sequence = (id: string, steps: Activity[]): Activity =>
  ({ type: ActivityTypeEnum.SEQUENCE, id, name: id, steps }) as Activity

describe('findActivityById', () => {
  it('finds top-level activity', () => {
    const result = findActivityById([task('a'), task('b')], 'b')
    expect(result?.id).toBe('b')
  })

  it('returns null when not found', () => {
    expect(findActivityById([task('a')], 'z')).toBeNull()
  })

  it('finds inside parallel branches', () => {
    const activities = [parallel('p1', [task('a'), task('b')])]
    expect(findActivityById(activities, 'b')?.id).toBe('b')
  })

  it('finds inside sequence steps', () => {
    const activities = [sequence('s1', [task('a'), task('b')])]
    expect(findActivityById(activities, 'b')?.id).toBe('b')
  })

  it('finds inside condition then branch', () => {
    const activities = [condition('c1', [task('a')])]
    expect(findActivityById(activities, 'a')?.id).toBe('a')
  })

  it('finds inside condition else branch', () => {
    const activities = [condition('c1', [task('a')], [task('b')])]
    expect(findActivityById(activities, 'b')?.id).toBe('b')
  })

  it('finds inside loop do', () => {
    const activities = [loop('l1', [task('a')])]
    expect(findActivityById(activities, 'a')?.id).toBe('a')
  })
})

describe('removeActivityFromList', () => {
  it('removes top-level activity', () => {
    const result = removeActivityFromList([task('a'), task('b')], 'a')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('b')
  })

  it('promotes single parallel branch when other is removed', () => {
    const activities = [parallel('p1', [task('a'), task('b')])]
    const result = removeActivityFromList(activities, 'a')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('b')
    expect(result[0].type).toBe(ActivityTypeEnum.TASK)
  })

  it('drops parallel with no branches left', () => {
    const activities = [parallel('p1', [task('a')])]
    const result = removeActivityFromList(activities, 'a')
    expect(result).toHaveLength(0)
  })

  it('keeps parallel with 2+ branches after removal', () => {
    const activities = [parallel('p1', [task('a'), task('b'), task('c')])]
    const result = removeActivityFromList(activities, 'a')
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe(ActivityTypeEnum.PARALLEL)
  })

  it('promotes single sequence step', () => {
    const activities = [sequence('s1', [task('a'), task('b')])]
    const result = removeActivityFromList(activities, 'a')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('b')
    expect(result[0].type).toBe(ActivityTypeEnum.TASK)
  })

  it('drops empty sequence', () => {
    const activities = [sequence('s1', [task('a')])]
    const result = removeActivityFromList(activities, 'a')
    expect(result).toHaveLength(0)
  })

  it('keeps sequence with 2+ steps after removal', () => {
    const activities = [sequence('s1', [task('a'), task('b'), task('c')])]
    const result = removeActivityFromList(activities, 'a')
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe(ActivityTypeEnum.SEQUENCE)
    if (result[0].type === ActivityTypeEnum.SEQUENCE) {
      expect(result[0].steps).toHaveLength(2)
      expect(result[0].steps[0].id).toBe('b')
      expect(result[0].steps[1].id).toBe('c')
    }
  })

  it('removes from condition then branch', () => {
    const activities = [condition('c1', [task('a'), task('b')], [task('c')])]
    const result = removeActivityFromList(activities, 'a')
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe(ActivityTypeEnum.CONDITION)
    const cond = result[0]
    if (cond.type === ActivityTypeEnum.CONDITION) {
      expect(cond.then).toHaveLength(1)
      expect(cond.then[0].id).toBe('b')
    }
  })

  it('removes from condition else branch', () => {
    const activities = [condition('c1', [task('a')], [task('b'), task('c')])]
    const result = removeActivityFromList(activities, 'b')
    expect(result[0].type).toBe(ActivityTypeEnum.CONDITION)
    const cond = result[0]
    if (cond.type === ActivityTypeEnum.CONDITION) {
      expect(cond.else).toHaveLength(1)
      expect(cond.else![0].id).toBe('c')
    }
  })

  it('removes from loop do', () => {
    const activities = [loop('l1', [task('a'), task('b')])]
    const result = removeActivityFromList(activities, 'a')
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe(ActivityTypeEnum.LOOP)
    const l = result[0]
    if (l.type === ActivityTypeEnum.LOOP) {
      expect(l.loop.do).toHaveLength(1)
      expect(l.loop.do[0].id).toBe('b')
    }
  })

  it('keeps loop with empty do array', () => {
    const activities = [loop('l1', [task('a')])]
    const result = removeActivityFromList(activities, 'a')
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe(ActivityTypeEnum.LOOP)
  })
})

describe('updateActivityInList', () => {
  it('updates top-level activity', () => {
    const result = updateActivityInList([task('a')], 'a', { name: 'updated' })
    expect(result[0].name).toBe('updated')
  })

  it('updates inside parallel branches', () => {
    const activities = [parallel('p1', [task('a'), task('b')])]
    const result = updateActivityInList(activities, 'b', { name: 'updated' })
    expect(result[0].type).toBe(ActivityTypeEnum.PARALLEL)
    if (result[0].type === ActivityTypeEnum.PARALLEL) {
      expect(result[0].branches[1].name).toBe('updated')
    }
  })

  it('updates inside sequence steps', () => {
    const activities = [sequence('s1', [task('a')])]
    const result = updateActivityInList(activities, 'a', { name: 'updated' })
    expect(result[0].type).toBe(ActivityTypeEnum.SEQUENCE)
    if (result[0].type === ActivityTypeEnum.SEQUENCE) {
      expect(result[0].steps[0].name).toBe('updated')
    }
  })

  it('updates inside condition then', () => {
    const activities = [condition('c1', [task('a')])]
    const result = updateActivityInList(activities, 'a', { name: 'updated' })
    expect(result[0].type).toBe(ActivityTypeEnum.CONDITION)
    if (result[0].type === ActivityTypeEnum.CONDITION) {
      expect(result[0].then[0].name).toBe('updated')
    }
  })

  it('updates inside condition else', () => {
    const activities = [condition('c1', [task('x')], [task('a')])]
    const result = updateActivityInList(activities, 'a', { name: 'updated' })
    expect(result[0].type).toBe(ActivityTypeEnum.CONDITION)
    if (result[0].type === ActivityTypeEnum.CONDITION) {
      expect(result[0].else![0].name).toBe('updated')
    }
  })

  it('updates inside loop do', () => {
    const activities = [loop('l1', [task('a')])]
    const result = updateActivityInList(activities, 'a', { name: 'updated' })
    expect(result[0].type).toBe(ActivityTypeEnum.LOOP)
    if (result[0].type === ActivityTypeEnum.LOOP) {
      expect(result[0].loop.do[0].name).toBe('updated')
    }
  })

  it('returns unchanged activity when id not found', () => {
    const activities = [task('a')]
    const result = updateActivityInList(activities, 'z', { name: 'nope' })
    expect(result[0].name).toBe('a')
  })
})

describe('reorderActivities', () => {
  it('reorders based on edge connections', () => {
    const activities = [task('b'), task('a')]
    const edges = [{ id: 'e1', source: 'a', target: 'b', sourceHandle: 'source', targetHandle: 'target' }]
    const result = reorderActivities(activities, edges)
    expect(result[0].id).toBe('a')
    expect(result[1].id).toBe('b')
  })

  it('maps nested condition activities to parent for ordering', () => {
    const cond = condition('c1', [task('t1')], [task('t2')])
    const activities = [task('after'), cond]
    const edges = [{ id: 'e1', source: 'c1', target: 'after', sourceHandle: 'source', targetHandle: 'target' }]
    const result = reorderActivities(activities, edges)
    expect(result[0].id).toBe('c1')
    expect(result[1].id).toBe('after')
  })

  it('maps nested loop activities to parent for ordering', () => {
    const l = loop('l1', [task('body')])
    const activities = [task('after'), l]
    const edges = [{ id: 'e1', source: 'l1', target: 'after', sourceHandle: 'source', targetHandle: 'target' }]
    const result = reorderActivities(activities, edges)
    expect(result[0].id).toBe('l1')
    expect(result[1].id).toBe('after')
  })

  it('maps nested parallel activities to parent for ordering', () => {
    const p = parallel('p1', [task('b1'), task('b2')])
    const activities = [task('after'), p]
    const edges = [{ id: 'e1', source: 'p1', target: 'after', sourceHandle: 'source', targetHandle: 'target' }]
    const result = reorderActivities(activities, edges)
    expect(result[0].id).toBe('p1')
    expect(result[1].id).toBe('after')
  })

  it('maps nested sequence activities to parent for ordering', () => {
    const s = sequence('s1', [task('step1'), task('step2')])
    const activities = [task('after'), s]
    const edges = [{ id: 'e1', source: 's1', target: 'after', sourceHandle: 'source', targetHandle: 'target' }]
    const result = reorderActivities(activities, edges)
    expect(result[0].id).toBe('s1')
    expect(result[1].id).toBe('after')
  })

  it('skips branch edges (loop, true, false)', () => {
    const activities = [task('a'), task('b')]
    const edges = [{ id: 'e1', source: 'a', target: 'b', sourceHandle: 'loop', targetHandle: 'target' }]
    const result = reorderActivities(activities, edges)
    expect(result.map((a) => a.id)).toEqual(['a', 'b'])
  })

  it('skips loop-back edges', () => {
    const activities = [task('a'), task('b')]
    const edges = [{ id: 'e1', source: 'b', target: 'a', sourceHandle: 'source', targetHandle: 'end' }]
    const result = reorderActivities(activities, edges)
    expect(result.map((a) => a.id)).toEqual(['a', 'b'])
  })

  it('preserves activities with no connections', () => {
    const activities = [task('a'), task('b'), task('c')]
    const edges = [{ id: 'e1', source: 'a', target: 'b', sourceHandle: 'source', targetHandle: 'target' }]
    const result = reorderActivities(activities, edges)
    expect(result).toHaveLength(3)
    expect(result.some((a) => a.id === 'c')).toBe(true)
  })

  it('maps deeply nested task inside condition then to top-level parent', () => {
    const cond = condition('c1', [sequence('s1', [task('deep_task')])])
    const activities = [task('after'), cond]
    const edges = [{ id: 'e1', source: 'deep_task', target: 'after', sourceHandle: 'source', targetHandle: 'target' }]
    const result = reorderActivities(activities, edges)
    expect(result[0].id).toBe('c1')
    expect(result[1].id).toBe('after')
  })

  it('maps deeply nested task inside loop do to top-level parent', () => {
    const l = loop('l1', [condition('c1', [task('deep_task')])])
    const activities = [task('after'), l]
    const edges = [{ id: 'e1', source: 'deep_task', target: 'after', sourceHandle: 'source', targetHandle: 'target' }]
    const result = reorderActivities(activities, edges)
    expect(result[0].id).toBe('l1')
    expect(result[1].id).toBe('after')
  })

  it('maps deeply nested task inside parallel branch sequence to top-level parent', () => {
    const p = parallel('p1', [sequence('s1', [task('deep_task')]), task('b2')])
    const activities = [task('after'), p]
    const edges = [{ id: 'e1', source: 'deep_task', target: 'after', sourceHandle: 'source', targetHandle: 'target' }]
    const result = reorderActivities(activities, edges)
    expect(result[0].id).toBe('p1')
    expect(result[1].id).toBe('after')
  })

  it('handles duplicate edges between same top-level activities', () => {
    const cond = condition('c1', [task('t1')], [task('t2')])
    const activities = [task('after'), cond]
    const edges = [
      { id: 'e1', source: 't1', target: 'after', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'e2', source: 't2', target: 'after', sourceHandle: 'source', targetHandle: 'target' },
    ]
    const result = reorderActivities(activities, edges)
    expect(result[0].id).toBe('c1')
    expect(result[1].id).toBe('after')
  })

  it('uses safety check to include activities lost during topological sort cycle', () => {
    const activities = [task('a'), task('b'), task('c')]
    const edges = [
      { id: 'e1', source: 'a', target: 'b', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'e2', source: 'b', target: 'a', sourceHandle: 'source', targetHandle: 'target' },
    ]
    const result = reorderActivities(activities, edges)
    expect(result).toHaveLength(3)
    expect(result.some((a) => a.id === 'a')).toBe(true)
    expect(result.some((a) => a.id === 'b')).toBe(true)
    expect(result.some((a) => a.id === 'c')).toBe(true)
  })

  it('handles self-referencing edge gracefully', () => {
    const activities = [task('a'), task('b')]
    const edges = [
      { id: 'e1', source: 'a', target: 'a', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'e2', source: 'a', target: 'b', sourceHandle: 'source', targetHandle: 'target' },
    ]
    const result = reorderActivities(activities, edges)
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('a')
    expect(result[1].id).toBe('b')
  })
})

describe('collectAllActivityIds', () => {
  it('collects top-level activity IDs', () => {
    const ids = collectAllActivityIds([task('a'), task('b')])
    expect(ids).toEqual(new Set(['a', 'b']))
  })

  it('collects IDs from parallel branches', () => {
    const ids = collectAllActivityIds([parallel('p1', [task('a'), task('b')])])
    expect(ids).toEqual(new Set(['p1', 'a', 'b']))
  })

  it('collects IDs from sequence steps', () => {
    const ids = collectAllActivityIds([sequence('s1', [task('a'), task('b')])])
    expect(ids).toEqual(new Set(['s1', 'a', 'b']))
  })

  it('collects IDs from condition then and else branches', () => {
    const ids = collectAllActivityIds([condition('c1', [task('a')], [task('b')])])
    expect(ids).toEqual(new Set(['c1', 'a', 'b']))
  })

  it('collects IDs from loop do', () => {
    const ids = collectAllActivityIds([loop('l1', [task('a')])])
    expect(ids).toEqual(new Set(['l1', 'a']))
  })

  it('collects deeply nested IDs', () => {
    const nested = parallel('p1', [sequence('s1', [condition('c1', [task('deep')])])])
    const ids = collectAllActivityIds([nested, task('top')])
    expect(ids).toEqual(new Set(['p1', 's1', 'c1', 'deep', 'top']))
  })
})
