import { describe, expect, it } from 'vitest'

import type { ActivityState } from '../workflows/execution/types'

import type { ActivityOrderItem } from './ExecutionActivityTable'
import { computeActivityDurationMs, sortExecutionActivities } from './sortExecutionActivities'

const NOW = Date.parse('2024-01-01T00:10:00Z')

function state(id: string, overrides: Partial<ActivityState> = {}): [string, ActivityState] {
  return [id, { activityId: id, status: 'pending', ...overrides }]
}

function activityIds(items: ActivityOrderItem[]): string[] {
  return items.map((item) => item.id)
}

const ORDER: ActivityOrderItem[] = [
  { id: 'b', name: 'Beta', type: 'script' },
  { id: 'a', name: 'Alpha', type: 'agentic' },
  { id: 'c', name: 'Charlie', type: 'script' },
]

const STATES = new Map<string, ActivityState>([
  state('a', { status: 'completed', startedAt: '2024-01-01T00:02:00Z', completedAt: '2024-01-01T00:05:00Z' }),
  state('b', { status: 'running', startedAt: '2024-01-01T00:01:00Z' }),
  state('c', { status: 'failed', startedAt: '2024-01-01T00:03:00Z', completedAt: '2024-01-01T00:04:00Z' }),
])

describe('sortExecutionActivities', () => {
  it('returns the same order when sort is null', () => {
    expect(sortExecutionActivities(ORDER, STATES, null, NOW)).toBe(ORDER)
  })

  it('returns the same reference when fewer than two activities', () => {
    const single = [ORDER[0]]
    expect(sortExecutionActivities(single, STATES, { field: 'activity', direction: 'asc' }, NOW)).toBe(single)
  })

  it.each([
    { field: 'activity', direction: 'asc' as const, expected: ['a', 'b', 'c'] },
    { field: 'timestamp', direction: 'asc' as const, expected: ['b', 'a', 'c'] },
    { field: 'timestamp', direction: 'desc' as const, expected: ['c', 'a', 'b'] },
    { field: 'status', direction: 'asc' as const, expected: ['a', 'c', 'b'] },
    { field: 'type', direction: 'asc' as const, expected: ['a', 'b', 'c'] },
    { field: 'duration', direction: 'asc' as const, expected: ['c', 'a', 'b'] },
    { field: 'not_a_column', direction: 'asc' as const, expected: ['a', 'b', 'c'] },
  ])('sorts by $field $direction', ({ field, direction, expected }) => {
    const sorted = sortExecutionActivities(ORDER, STATES, { field, direction }, NOW)
    expect(activityIds(sorted)).toEqual(expected)
  })

  it('places missing timestamps last', () => {
    const withMissing: ActivityOrderItem[] = [...ORDER, { id: 'd', name: 'Delta', type: 'script' }]
    const statesWithMissing = new Map(STATES)
    statesWithMissing.set('d', { activityId: 'd', status: 'pending' })

    const sorted = sortExecutionActivities(
      withMissing,
      statesWithMissing,
      { field: 'timestamp', direction: 'asc' },
      NOW
    )
    expect(activityIds(sorted).at(-1)).toBe('d')
  })

  it('falls back to id when activity name is missing', () => {
    const unnamed: ActivityOrderItem[] = [
      { id: 'z', type: 'script' },
      { id: 'a', type: 'script' },
    ]
    const sorted = sortExecutionActivities(unnamed, new Map(), { field: 'activity', direction: 'asc' }, NOW)
    expect(activityIds(sorted)).toEqual(['a', 'z'])
  })

  it('sorts equal timestamps by id and keeps null durations last in both directions', () => {
    const tied: ActivityOrderItem[] = [
      { id: 'b', name: 'B' },
      { id: 'a', name: 'A' },
      { id: 'c', name: 'C' },
    ]
    const tiedStates = new Map<string, ActivityState>([
      state('a', { status: 'completed', startedAt: '2024-01-01T00:01:00Z', completedAt: '2024-01-01T00:02:00Z' }),
      state('b', { status: 'completed', startedAt: '2024-01-01T00:01:00Z', completedAt: '2024-01-01T00:02:00Z' }),
      state('c', { status: 'pending' }),
    ])

    expect(
      activityIds(sortExecutionActivities(tied, tiedStates, { field: 'timestamp', direction: 'asc' }, NOW))
    ).toEqual(['a', 'b', 'c'])
    expect(
      activityIds(sortExecutionActivities(tied, tiedStates, { field: 'duration', direction: 'asc' }, NOW)).at(-1)
    ).toBe('c')
    expect(
      activityIds(sortExecutionActivities(tied, tiedStates, { field: 'duration', direction: 'desc' }, NOW)).at(-1)
    ).toBe('c')
  })
})

describe('computeActivityDurationMs', () => {
  it.each([
    {
      name: 'completed duration',
      state: {
        activityId: 'x',
        status: 'completed' as const,
        startedAt: '2024-01-01T00:00:00Z',
        completedAt: '2024-01-01T00:01:30Z',
      },
      expected: 90_000,
    },
    {
      name: 'live duration for running',
      state: { activityId: 'x', status: 'running' as const, startedAt: '2024-01-01T00:00:00Z' },
      expected: 600_000,
    },
    {
      name: 'live duration for retrying',
      state: { activityId: 'x', status: 'retrying' as const, startedAt: '2024-01-01T00:00:00Z' },
      expected: 600_000,
    },
    {
      name: 'null when startedAt missing',
      state: { activityId: 'x', status: 'pending' as const },
      expected: null,
    },
    {
      name: 'null when started but inactive',
      state: { activityId: 'x', status: 'pending' as const, startedAt: '2024-01-01T00:00:00Z' },
      expected: null,
    },
    {
      name: 'null for invalid startedAt',
      state: { activityId: 'x', status: 'running' as const, startedAt: 'not-a-date' },
      expected: null,
    },
  ])('returns $name', ({ state: activityState, expected }) => {
    expect(computeActivityDurationMs(activityState, NOW)).toBe(expected)
  })

  it('returns null for undefined state', () => {
    expect(computeActivityDurationMs(undefined, NOW)).toBeNull()
  })
})
