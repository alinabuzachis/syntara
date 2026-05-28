import type { AuditAPI } from '@ansible/nexus-contracts'
import { type ThProps, Thead, Tbody, Tr, Th, Td, ExpandableRowContent } from '@patternfly/react-table'
import { Fragment } from 'react'

import { AppRoute } from '../../app/AppRoute'
import { DateCell } from '../../components/table/DateCell'
import { LinkCell } from '../../components/table/LinkCell'
import { type TableFooterProps, NxScrollableTableContainer } from '../../components/table/NxScrollableTableContainer'
import { parseResourceUrn } from '../../utils/resourceUrn'
import { capitalize, formatSnakeCase } from '../../utils/stringUtils'

import { AuditEventExpandedContent, AuditSeverityLabel, AuditStatusLabel } from './auditUtils'

type AuditEventRead = AuditAPI.components['schemas']['AuditEventRead']

function ResourceCell(props: Readonly<{ name: string | null | undefined; urn: string }>) {
  const { name, urn } = props
  if (!urn) {
    return name ?? '—'
  }
  const parsed = parseResourceUrn(urn)
  if (!parsed) {
    return name ?? urn
  }
  const label = name ?? `${parsed.type}:${parsed.id}`
  if (parsed.href) {
    return <LinkCell href={parsed.href}>{label}</LinkCell>
  }
  return label
}

type AuditLogTableProps = {
  events: AuditEventRead[]
  footer: TableFooterProps
  expandedRows: Set<string>
  onToggleRow: (eventId: string) => void
  allRowsExpanded: boolean
  onCollapseAll: (event: unknown, rowIndex: number, isOpen: boolean) => void
  getSortParams: (columnIndex: number) => ThProps['sort']
}

export function AuditLogTable({
  events,
  footer,
  expandedRows,
  onToggleRow,
  allRowsExpanded,
  onCollapseAll,
  getSortParams,
}: Readonly<AuditLogTableProps>) {
  const collapseAllAriaLabel = allRowsExpanded ? 'Collapse all' : 'Expand all'

  return (
    <NxScrollableTableContainer aria-label="Audit log table" isExpandable footer={footer}>
      <Thead>
        <Tr>
          <Th
            expand={{
              areAllExpanded: !allRowsExpanded,
              collapseAllAriaLabel,
              onToggle: onCollapseAll,
            }}
            aria-label="Row expansion"
          />
          <Th modifier="nowrap" sort={getSortParams(0)}>
            Timestamp
          </Th>
          <Th modifier="nowrap" sort={getSortParams(1)}>
            Event
          </Th>
          <Th modifier="nowrap" sort={getSortParams(2)}>
            Actor Type
          </Th>
          <Th modifier="nowrap" sort={getSortParams(3)}>
            User
          </Th>
          <Th modifier="nowrap" sort={getSortParams(4)}>
            Resource
          </Th>
          <Th modifier="nowrap" sort={getSortParams(5)}>
            Status
          </Th>
          <Th modifier="nowrap" sort={getSortParams(6)}>
            Severity
          </Th>
        </Tr>
      </Thead>
      <Tbody>
        {events.map((event, index) => {
          const eventId = event.id ?? ''
          const isExpanded = expandedRows.has(eventId)

          return (
            <Fragment key={eventId}>
              <Tr isContentExpanded={isExpanded}>
                <Td
                  expand={{
                    rowIndex: index,
                    isExpanded,
                    onToggle: () => onToggleRow(eventId),
                  }}
                />
                <Td dataLabel="Timestamp">
                  <DateCell dateString={event.created_at} />
                </Td>
                <Td dataLabel="Event">{formatSnakeCase(event.event_category)}</Td>
                <Td dataLabel="Actor Type">{event.actor_type ? capitalize(event.actor_type) : '—'}</Td>
                <Td dataLabel="User">
                  {event.actor_username && event.actor_id ? (
                    <LinkCell href={AppRoute.AccessManagement.UserDetail.replace(':userId', event.actor_id)}>
                      {event.actor_username}
                    </LinkCell>
                  ) : (
                    '—'
                  )}
                </Td>
                <Td dataLabel="Resource">
                  {event.resource_urn || event.resource_name ? (
                    <ResourceCell name={event.resource_name} urn={event.resource_urn ?? ''} />
                  ) : (
                    '—'
                  )}
                </Td>
                <Td dataLabel="Status">
                  {event.event_status ? <AuditStatusLabel status={event.event_status} /> : '—'}
                </Td>
                <Td dataLabel="Severity">
                  <AuditSeverityLabel severity={event.event_severity ?? 'info'} />
                </Td>
              </Tr>
              <Tr isExpanded={isExpanded}>
                <Td colSpan={8}>
                  <ExpandableRowContent>
                    <AuditEventExpandedContent event={event} />
                  </ExpandableRowContent>
                </Td>
              </Tr>
            </Fragment>
          )
        })}
      </Tbody>
    </NxScrollableTableContainer>
  )
}
