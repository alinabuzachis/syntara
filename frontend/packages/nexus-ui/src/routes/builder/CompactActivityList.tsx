import { Content, ContentVariants, Stack, StackItem } from '@patternfly/react-core'
import { Table, Tbody, Td, Tr } from '@patternfly/react-table'
import type React from 'react'

import { formatTimeRange } from '../../utils/dateUtils'
import type { ActivityState } from '../workflows/execution/types'

import type { ActivityOrderItem } from './ExecutionActivityTable'
import { ActivityStatusLabel } from './ExecutionStatus'

const COMPACT_TABLE_STYLE = {
  tableLayout: 'fixed',
  width: '100%',
} as React.CSSProperties

const SUBTLE_TEXT: React.CSSProperties = {
  color: 'var(--pf-t--global--text--color--subtle)',
  margin: 0,
}

const COMPACT_NAME_CELL: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const COMPACT_STATUS_CELL: React.CSSProperties = {
  verticalAlign: 'top',
  whiteSpace: 'nowrap',
  width: '30%',
}

const CLICKABLE_ROW_STYLE: React.CSSProperties = {
  cursor: 'pointer',
}

export type CompactActivityListProps = {
  activityStates: Map<string, ActivityState>
  activityOrder: ActivityOrderItem[]
  onRowClick?: (nodeId: string, nodeName: string) => void
  selectedNodeId?: string | null
}

export function CompactActivityList({
  activityStates,
  activityOrder,
  onRowClick,
  selectedNodeId,
}: Readonly<CompactActivityListProps>) {
  return (
    <Table aria-label="Activity list" isPlain variant="compact" style={COMPACT_TABLE_STYLE}>
      <Tbody>
        {activityOrder.map(({ id, name }) => {
          const state = activityStates.get(id)
          const timeRange = formatTimeRange(state?.startedAt, state?.completedAt)
          const displayName = name ?? id
          const isSelected = id === selectedNodeId

          return (
            <Tr
              key={id}
              style={CLICKABLE_ROW_STYLE}
              onRowClick={onRowClick ? () => onRowClick(id, displayName) : undefined}
              isRowSelected={isSelected}
            >
              <Td dataLabel="Name" style={COMPACT_NAME_CELL}>
                <Stack>
                  <StackItem>{displayName}</StackItem>
                  {timeRange && (
                    <StackItem>
                      <Content component={ContentVariants.small} style={SUBTLE_TEXT}>
                        {timeRange}
                      </Content>
                    </StackItem>
                  )}
                </Stack>
              </Td>
              <Td dataLabel="Status" modifier="nowrap" style={COMPACT_STATUS_CELL}>
                <ActivityStatusLabel status={state?.status ?? 'pending'} />
              </Td>
            </Tr>
          )
        })}
      </Tbody>
    </Table>
  )
}
