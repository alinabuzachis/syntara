import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { ActivityState } from '../automations/execution/types'

import { ExecutionActivityTable, type ActivityOrderItem, type TriggerItem } from './ExecutionActivityTable'

vi.mock('./ExecutionStatus', () => ({
  ActivityStatusLabel: ({ status }: { status: string }) => <div data-testid="activity-status-label">{status}</div>,
}))

const T0 = '2024-01-01T00:00:00Z'
const T1 = '2024-01-01T00:00:05Z'
const T2 = '2024-01-01T00:01:00Z'
const NOW = Date.parse('2024-01-01T00:02:00Z')

function state(id: string, overrides: Partial<ActivityState> = {}): [string, ActivityState] {
  return [id, { activityId: id, status: 'pending', ...overrides }]
}

function renderTable({
  triggers = [],
  states = new Map<string, ActivityState>(),
  order = [],
  startedAt = T0,
}: {
  triggers?: TriggerItem[]
  states?: Map<string, ActivityState>
  order?: ActivityOrderItem[]
  startedAt?: string | null
} = {}) {
  return render(
    <ExecutionActivityTable
      triggers={triggers}
      activityStates={states}
      activityOrder={order}
      executionStartedAt={startedAt}
      now={NOW}
    />
  )
}

describe('ExecutionActivityTable', () => {
  describe('trigger rows', () => {
    it('capitalizes trigger type as default name', () => {
      renderTable({ triggers: [{ index: 0, type: 'manual' }] })
      expect(screen.getByText('Manual')).toBeInTheDocument()
    })

    it('uses custom name over type when provided', () => {
      renderTable({ triggers: [{ index: 0, type: 'scheduled', name: 'Nightly build' }] })
      expect(screen.getByText('Nightly build')).toBeInTheDocument()
    })

    it('shows completed status when executionStartedAt is set', () => {
      renderTable({ triggers: [{ index: 0, type: 'manual' }] })

      expect(screen.getAllByTestId('activity-status-label')[0]).toHaveTextContent('completed')
    })

    it('shows pending status and dashes when executionStartedAt is null', () => {
      renderTable({ triggers: [{ index: 0, type: 'manual' }], startedAt: null })

      expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3)
      expect(screen.getAllByTestId('activity-status-label')[0]).toHaveTextContent('pending')
    })

    it('computes elapsed from executionStartedAt to first activity startedAt', () => {
      renderTable({
        triggers: [{ index: 0, type: 'manual' }],
        states: new Map([state('task-1', { status: 'running', startedAt: T1 })]),
        order: [{ id: 'task-1' }],
      })

      expect(screen.getByText('5s')).toBeInTheDocument()
    })
  })

  describe('activity rows', () => {
    it('renders name, or falls back to activity ID', () => {
      renderTable({
        states: new Map([state('task-1'), state('task-2')]),
        order: [{ id: 'task-1', name: 'Process data' }, { id: 'task-2' }],
      })

      expect(screen.getByText('Process data')).toBeInTheDocument()
      expect(screen.getByText('task-2')).toBeInTheDocument()
    })

    it('shows formatted dates and elapsed for completed activity', () => {
      renderTable({
        states: new Map([state('task-1', { status: 'completed', startedAt: T0, completedAt: T2 })]),
        order: [{ id: 'task-1', name: 'Task' }],
      })

      expect(screen.getByText('1m 0s')).toBeInTheDocument()
    })

    it('shows dashes for pending activity', () => {
      renderTable({
        states: new Map([state('task-1')]),
        order: [{ id: 'task-1', name: 'Task' }],
      })

      expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3)
    })

    it('shows live elapsed for running activity', () => {
      renderTable({
        states: new Map([state('task-1', { status: 'running', startedAt: T0 })]),
        order: [{ id: 'task-1', name: 'Task' }],
      })

      expect(screen.getByText('2m 0s')).toBeInTheDocument()
    })

    it('renders correct status per row', () => {
      renderTable({
        states: new Map([state('a', { status: 'completed' }), state('b', { status: 'failed' })]),
        order: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' },
        ],
      })

      const labels = screen.getAllByTestId('activity-status-label')
      expect(labels[0]).toHaveTextContent('completed')
      expect(labels[1]).toHaveTextContent('failed')
    })
  })

  describe('row ordering', () => {
    it('renders triggers before activities', () => {
      renderTable({
        triggers: [{ index: 0, type: 'manual' }],
        states: new Map([state('task-1', { status: 'running', startedAt: T1 })]),
        order: [{ id: 'task-1', name: 'Task' }],
      })

      const rows = screen.getAllByRole('row')
      // 1 header row + 1 trigger + 1 activity = 3
      expect(rows).toHaveLength(3)
      expect(rows[1]).toHaveTextContent('Manual')
      expect(rows[2]).toHaveTextContent('Task')
    })
  })

  describe('accessibility', () => {
    it('renders column headers', () => {
      renderTable()

      expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: 'Started' })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: 'Ended' })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: 'Elapsed time' })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument()
    })
  })
})
