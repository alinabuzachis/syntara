import { Content, ContentVariants } from '@patternfly/react-core'
import { RhUiExternalLinkIcon } from '@patternfly/react-icons'
import { Table, Thead, Th, Tbody, Td, Tr } from '@patternfly/react-table'
import type React from 'react'
import { Fragment, useMemo } from 'react'

import { extractAAPJobUrl, isAAPNodeType } from '../../utils/aapJobUrl'
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

const AAP_LINK_STYLE: React.CSSProperties = {
  textDecoration: 'underline dotted',
  textUnderlineOffset: '3px',
  whiteSpace: 'nowrap',
}

function AAPJobLink({ url }: Readonly<{ url: string }>) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={AAP_LINK_STYLE}>
      View job in AAP <RhUiExternalLinkIcon />
    </a>
  )
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
  hasAAPColumn,
}: Readonly<{
  id: string
  name?: string
  type?: string
  state?: ActivityState
  now: number
  executionError?: string | null
  onRowClick?: (nodeId: string, nodeName: string) => void
  isSelected?: boolean
  hasAAPColumn: boolean
}>) {
  const elapsedMs = state ? computeRowElapsedMs(state, now) : undefined
  const displayName = name ?? id
  const jobUrl = isAAPNodeType(type) ? extractAAPJobUrl(state?.outputData) : null
  const columnCount = hasAAPColumn ? 6 : 5

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
        {hasAAPColumn && <Td dataLabel="AAP Job">{jobUrl ? <AAPJobLink url={jobUrl} /> : null}</Td>}
      </Tr>
      {state?.errorDetails && state.errorDetails !== executionError && (
        <Tr>
          <Td colSpan={columnCount} style={{ paddingTop: 0 }}>
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
  const hasAAPColumn = useMemo(() => activityOrder.some((a) => isAAPNodeType(a.type)), [activityOrder])

  return (
    <Table aria-label="Activity states" isPlain isStickyHeader variant="compact">
      <Thead>
        <Tr>
          <Th>Name</Th>
          <Th>Started</Th>
          <Th>Ended</Th>
          <Th>Elapsed time</Th>
          <Th>Status</Th>
          {hasAAPColumn && <Th aria-label="AAP job link" />}
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
            hasAAPColumn={hasAAPColumn}
          />
        ))}
      </Tbody>
    </Table>
  )
}
