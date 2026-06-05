import { Content, ContentVariants } from '@patternfly/react-core'
import { Table, Thead, Th, Tbody, Td, Tr } from '@patternfly/react-table'
import type React from 'react'
import { Fragment } from 'react'

import { formatExecutionDateTime, formatElapsedTime } from '../../utils/dateUtils'
import type { ActivityState } from '../workflows/execution/types'

import { ActivityStatusLabel } from './ExecutionStatus'

export type ActivityOrderItem = {
  id: string
  name?: string
  type?: string
}

type ExecutionActivityTableProps = {
  activityStates: Map<string, ActivityState>
  activityOrder: ActivityOrderItem[]
  /** Current timestamp (ms) used to compute elapsed time for running activities. */
  now: number
  /** Execution-level error — activity errors matching this are suppressed to avoid duplication. */
  executionError?: string | null
  /** Callback when a row is clicked to select a node. */
  onRowClick?: (nodeId: string, nodeName: string) => void
  /** Currently selected node ID for row highlighting. */
  selectedNodeId?: string | null
}

const DASH = (
  <Content
    component={ContentVariants.small}
    style={{ color: 'var(--pf-t--global--color--text--secondary)', margin: 0 }}
  >
    —
  </Content>
)

const ERROR_STYLE: React.CSSProperties = {
  color: 'var(--pf-t--global--color--status--danger--default)',
  fontSize: 'var(--pf-t--global--font--size--sm)',
  padding: 'var(--pf-t--global--spacer--xs) 0',
  margin: 0,
}

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

function formatOptionalDate(date: string | null | undefined) {
  return date ? formatExecutionDateTime(date) : undefined
}

function ActivityRow({
  id,
  name,
  type,
  state,
  now,
  executionError,
  onRowClick,
  isSelected,
}: Readonly<{
  id: string
  name?: string
  type?: string
  state?: ActivityState
  now: number
  executionError?: string | null
  onRowClick?: (nodeId: string, nodeName: string) => void
  isSelected?: boolean
}>) {
  const elapsedMs = state ? computeRowElapsedMs(state, now) : undefined
  const displayName = name ?? id

  return (
    <Fragment>
      <Tr
        style={{ cursor: 'pointer' }}
        onRowClick={onRowClick ? () => onRowClick(id, displayName) : undefined}
        isRowSelected={isSelected}
      >
        <Td dataLabel="Name">{displayName}</Td>
        <Td dataLabel="Started">{formatOptionalDate(state?.startedAt) ?? DASH}</Td>
        <Td dataLabel="Ended">{formatOptionalDate(state?.completedAt) ?? DASH}</Td>
        <Td dataLabel="Elapsed time">{elapsedMs === undefined ? DASH : formatElapsedTime(elapsedMs)}</Td>
        <Td dataLabel="Status" modifier="nowrap">
          <ActivityStatusLabel status={state?.status ?? 'pending'} nodeType={type} />
        </Td>
      </Tr>
      {state?.errorDetails && state.errorDetails !== executionError && (
        <Tr>
          <Td colSpan={5} style={{ paddingTop: 0 }}>
            <Content component={ContentVariants.small} style={ERROR_STYLE}>
              {state.errorDetails}
            </Content>
          </Td>
        </Tr>
      )}
    </Fragment>
  )
}

export function ExecutionActivityTable({
  activityStates,
  activityOrder,
  now,
  executionError,
  onRowClick,
  selectedNodeId,
}: ExecutionActivityTableProps) {
  return (
    <Table aria-label="Activity states" isPlain isStickyHeader variant="compact">
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
        {activityOrder.map(({ id, name, type }) => (
          <ActivityRow
            key={id}
            id={id}
            name={name}
            type={type}
            state={activityStates.get(id)}
            now={now}
            executionError={executionError}
            onRowClick={onRowClick}
            isSelected={id === selectedNodeId}
          />
        ))}
      </Tbody>
    </Table>
  )
}
