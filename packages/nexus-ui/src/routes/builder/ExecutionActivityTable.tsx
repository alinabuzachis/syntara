import { Flex, FlexItem, Icon } from '@patternfly/react-core'
import { AngleDownIcon, AngleRightIcon } from '@patternfly/react-icons'
import { Table, Thead, Th, Tbody, Td, Tr } from '@patternfly/react-table'
import type React from 'react'
import { Fragment, useState } from 'react'

import { CodeBlock } from '../../components/details/CodeBlock'
import { formatExecutionDateTime, formatElapsedTime } from '../../utils/dateUtils'
import type { ActivityState } from '../workflows/execution/types'

import { ActivityStatusLabel } from './ExecutionStatus'

export type ActivityOrderItem = {
  id: string
  name?: string
}

export type TriggerItem = {
  index: number
  type: string
  name?: string
}

type ExecutionActivityTableProps = {
  triggers: TriggerItem[]
  activityStates: Map<string, ActivityState>
  activityOrder: ActivityOrderItem[]
  /** Execution start time — used as the trigger's "started" timestamp. */
  executionStartedAt?: string | null
  /** Current timestamp (ms) used to compute elapsed time for running activities. */
  now: number
  /** Execution-level error — activity errors matching this are suppressed to avoid duplication. */
  executionError?: string | null
}

const DASH = <span style={{ color: 'var(--pf-t--global--color--text--secondary)' }}>—</span>

const TABLE_STYLE = {
  '--pf-t--global--border--color--default': 'rgba(196, 181, 253, 0.2)',
} as React.CSSProperties

const ERROR_STYLE: React.CSSProperties = {
  color: 'var(--pf-t--global--color--status--danger--default)',
  fontSize: 'var(--pf-t--global--font--size--sm)',
  padding: 'var(--pf-t--global--spacer--xs) 0',
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

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function formatOptionalDate(date: string | null | undefined) {
  return date ? formatExecutionDateTime(date) : undefined
}

function ActivityNameCell({
  label,
  hasOutput,
  isExpanded,
}: Readonly<{
  label: string
  hasOutput: boolean
  isExpanded: boolean
}>) {
  if (!hasOutput) return <>{label}</>
  return (
    <Flex gap={{ default: 'gapSm' }} alignItems={{ default: 'alignItemsCenter' }} flexWrap={{ default: 'nowrap' }}>
      <FlexItem>
        <Icon size="sm">{isExpanded ? <AngleDownIcon /> : <AngleRightIcon />}</Icon>
      </FlexItem>
      <FlexItem>{label}</FlexItem>
    </Flex>
  )
}

function ActivityRow({
  id,
  name,
  state,
  now,
  isExpanded,
  onToggle,
  executionError,
}: Readonly<{
  id: string
  name?: string
  state?: ActivityState
  now: number
  isExpanded: boolean
  onToggle: (id: string) => void
  executionError?: string | null
}>) {
  const elapsedMs = state ? computeRowElapsedMs(state, now) : undefined
  const hasOutput = state?.outputData != null

  return (
    <Fragment>
      <Tr style={hasOutput ? { cursor: 'pointer' } : undefined} onRowClick={hasOutput ? () => onToggle(id) : undefined}>
        <Td dataLabel="Name">
          <ActivityNameCell label={name ?? id} hasOutput={hasOutput} isExpanded={isExpanded} />
        </Td>
        <Td dataLabel="Started">{formatOptionalDate(state?.startedAt) ?? DASH}</Td>
        <Td dataLabel="Ended">{formatOptionalDate(state?.completedAt) ?? DASH}</Td>
        <Td dataLabel="Elapsed time">{elapsedMs === undefined ? DASH : formatElapsedTime(elapsedMs)}</Td>
        <Td dataLabel="Status" modifier="nowrap">
          <ActivityStatusLabel status={state?.status ?? 'pending'} />
        </Td>
      </Tr>
      {state?.errorDetails && state.errorDetails !== executionError && (
        <Tr>
          <Td colSpan={5} style={{ paddingTop: 0 }}>
            <div style={ERROR_STYLE}>{state.errorDetails}</div>
          </Td>
        </Tr>
      )}
      {isExpanded && state?.outputData && (
        <Tr>
          <Td colSpan={5} style={{ paddingTop: 0 }}>
            <CodeBlock jsonObject={state.outputData} enableCopy />
          </Td>
        </Tr>
      )}
    </Fragment>
  )
}

export function ExecutionActivityTable({
  triggers,
  activityStates,
  activityOrder,
  executionStartedAt,
  now,
  executionError,
}: ExecutionActivityTableProps) {
  const [expandedActivities, setExpandedActivities] = useState<Set<string>>(new Set())

  const toggleExpanded = (id: string) => {
    setExpandedActivities((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

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

        {activityOrder.map(({ id, name }) => (
          <ActivityRow
            key={id}
            id={id}
            name={name}
            state={activityStates.get(id)}
            now={now}
            isExpanded={expandedActivities.has(id)}
            onToggle={toggleExpanded}
            executionError={executionError}
          />
        ))}
      </Tbody>
    </Table>
  )
}
