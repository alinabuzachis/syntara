import { Table, Thead, Th, Tbody, Td, Tr } from '@patternfly/react-table'
import type React from 'react'

import { formatExecutionDateTime, formatElapsedTime } from '../../utils/dateUtils'
import type { ActivityState } from '../automations/execution/types'

import { ActivityStatusLabel } from './ExecutionStatus'

export interface ActivityOrderItem {
  id: string
  name?: string
}

export interface TriggerItem {
  index: number
  type: string
  name?: string
}

interface ExecutionActivityTableProps {
  triggers: TriggerItem[]
  activityStates: Map<string, ActivityState>
  activityOrder: ActivityOrderItem[]
  /** Execution start time — used as the trigger's "started" timestamp. */
  executionStartedAt?: string | null
  /** Current timestamp (ms) used to compute elapsed time for running activities. */
  now: number
}

const DASH = <span style={{ color: 'var(--pf-t--global--color--text--secondary)' }}>—</span>

const TABLE_STYLE = {
  '--pf-t--global--border--color--default': 'rgba(196, 181, 253, 0.2)',
} as React.CSSProperties

function computeRowElapsedMs(state: ActivityState, now: number): number | undefined {
  const startedAtMs = state.startedAt != null ? Date.parse(state.startedAt) : null
  if (startedAtMs === null || Number.isNaN(startedAtMs)) return undefined

  const completedAtMs = state.completedAt ? Date.parse(state.completedAt) : null
  if (completedAtMs && !Number.isNaN(completedAtMs)) {
    return Math.max(0, completedAtMs - startedAtMs)
  }

  const isActive = state.status === 'running' || state.status === 'retrying'
  if (isActive) {
    return Math.max(0, now - startedAtMs)
  }

  return undefined
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export function ExecutionActivityTable({
  triggers,
  activityStates,
  activityOrder,
  executionStartedAt,
  now,
}: ExecutionActivityTableProps) {
  return (
    <Table aria-label="Activity states" isPlain isStickyHeader variant="compact" style={TABLE_STYLE}>
      <Thead>
        <Tr>
          <Th>Name</Th>
          <Th>Started</Th>
          <Th>Ended</Th>
          <Th>Elapsed time</Th>
          <Th>Status</Th>
        </Tr>
      </Thead>
      <Tbody>
        {triggers.map((trigger) => {
          const displayName = trigger.name ?? capitalizeFirst(trigger.type)
          const startedFormatted = executionStartedAt ? formatExecutionDateTime(executionStartedAt) : undefined
          const firstActivity = activityOrder.length > 0 ? activityStates.get(activityOrder[0].id) : undefined
          const triggerEndedAt = firstActivity?.startedAt ?? executionStartedAt
          const endedFormatted = triggerEndedAt ? formatExecutionDateTime(triggerEndedAt) : undefined
          const triggerElapsedMs =
            executionStartedAt && triggerEndedAt
              ? Math.max(0, Date.parse(triggerEndedAt) - Date.parse(executionStartedAt))
              : undefined
          const triggerElapsedLabel = triggerElapsedMs !== undefined ? formatElapsedTime(triggerElapsedMs) : undefined

          const triggerStatus = executionStartedAt ? 'completed' : 'pending'

          return (
            <Tr key={`trigger-${trigger.index}`}>
              <Td dataLabel="Name">{displayName}</Td>
              <Td dataLabel="Started">{startedFormatted ?? DASH}</Td>
              <Td dataLabel="Ended">{endedFormatted ?? DASH}</Td>
              <Td dataLabel="Elapsed time">{triggerElapsedLabel ?? DASH}</Td>
              <Td dataLabel="Status" modifier="nowrap">
                <ActivityStatusLabel status={triggerStatus} />
              </Td>
            </Tr>
          )
        })}

        {activityOrder.map(({ id, name }) => {
          const state = activityStates.get(id)
          const displayName = name ?? id
          const startedFormatted = state?.startedAt ? formatExecutionDateTime(state.startedAt) : undefined
          const endedFormatted = state?.completedAt ? formatExecutionDateTime(state.completedAt) : undefined
          const elapsedMs = state ? computeRowElapsedMs(state, now) : undefined
          const elapsedLabel = elapsedMs !== undefined ? formatElapsedTime(elapsedMs) : undefined
          const status = state?.status ?? 'pending'

          return (
            <Tr key={id}>
              <Td dataLabel="Name">{displayName}</Td>
              <Td dataLabel="Started">{startedFormatted ?? DASH}</Td>
              <Td dataLabel="Ended">{endedFormatted ?? DASH}</Td>
              <Td dataLabel="Elapsed time">{elapsedLabel ?? DASH}</Td>
              <Td dataLabel="Status" modifier="nowrap">
                <ActivityStatusLabel status={status} />
              </Td>
            </Tr>
          )
        })}
      </Tbody>
    </Table>
  )
}
