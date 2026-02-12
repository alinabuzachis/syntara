import type { Approval } from '@ansible/nexus-contracts'
import {
  CompassPanel,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  SearchInput,
  StackItem,
} from '@patternfly/react-core'
import { Thead, Tbody, Tr, Th, Td, ExpandableRowContent } from '@patternfly/react-table'
import { useMemo, useState } from 'react'

import { AppPage } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import { approvalsClient } from '../../client'
import { EmptyStateFilter } from '../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../components/EmptyStateNoData'
import { useQueryState } from '../../components/states/useQueryState'
import { DateCell } from '../../components/table/DateCell'
import { LinkCell } from '../../components/table/LinkCell'
import { ScrollableTableContainer } from '../../components/table/ScrollableTableContainer'
import { useFuse } from '../../hooks/useFuse'
import { useTableSort } from '../../hooks/useTableSort'

import { ApprovalStatusBadges } from './approvalUtils'

type ApprovalWithDetails = Approval & {
  approvalName?: string
  // approvalType?: string // Removed for RH1 - may be added back later
  automationName?: string
  workflowId?: string
}

// Column indices for sorting (excluding the expand column)
const SORT_COLUMNS = ['approvalName', 'automationName', 'requested_at', 'decided_at', 'status'] as const
type SortColumn = (typeof SORT_COLUMNS)[number]

const getApprovalDetails = (approval: ApprovalWithDetails) => ({
  approvalName: approval.name || approval.id,
  automationName: approval.workflow_context?.workflow_name || 'Unknown',
  workflowId: approval.workflow_context?.workflow_version_id,
})

const getDecidedInfo = (approval: ApprovalWithDetails) => ({
  decidedAt: approval.decided_at,
  decidedBy: approval.decided_by,
})

const getSortValue = (approval: ApprovalWithDetails, sortColumn: SortColumn) => {
  switch (sortColumn) {
    case 'approvalName':
      return approval.approvalName || approval.id
    // case 'approvalType': // Removed for RH1
    //   return approval.approvalType || ''
    case 'automationName':
      return approval.automationName || ''
    case 'requested_at':
      // Use createdAt from BaseResource (represents when approval was requested)
      return approval.createdAt ? new Date(approval.createdAt).getTime() : 0
    case 'decided_at': {
      const { decidedAt } = getDecidedInfo(approval)
      return decidedAt ? new Date(decidedAt).getTime() : undefined
    }
    case 'status':
      return approval.status || ''
  }
}

const DecidedCell = ({ approval }: { approval: ApprovalWithDetails }) => {
  const { decidedAt, decidedBy } = getDecidedInfo(approval)

  if (!decidedAt) {
    return <DateCell dateString={null} />
  }

  return (
    <>
      {decidedBy ? (
        <>
          <LinkCell href={`/users/${decidedBy.id}`}>{decidedBy.name}</LinkCell>
          {' at '}
        </>
      ) : null}
      <DateCell dateString={decidedAt} />
    </>
  )
}

export default function Approvals() {
  const [cursor, setCursor] = useState<string | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  // Use the table sort hook - default to 'requested_at' (index 2) descending
  const { activeSortIndex, sortDirection, getSortParams } = useTableSort({
    initialSortIndex: 2,
    initialDirection: 'desc',
  })
  const sortColumn = SORT_COLUMNS[activeSortIndex]

  const approvalsQuery = approvalsClient.useQuery('get', '/approvals', {
    params: {
      query: {
        cursor: cursor ?? undefined,
        limit: 20,
        include_total: true,
      },
    },
  })

  const approvalsData = approvalsQuery.data

  const enrichedApprovals = useMemo(() => {
    const approvals = (approvalsData?.resources ?? []) as ApprovalWithDetails[]
    return approvals.map((approval) => {
      const { approvalName, automationName, workflowId } = getApprovalDetails(approval)
      return {
        ...approval,
        approvalName,
        automationName,
        workflowId,
      }
    })
  }, [approvalsData?.resources])

  const {
    search,
    setSearch,
    items: filteredApprovals,
  } = useFuse(enrichedApprovals, [{ name: 'approvalName' }, { name: 'automationName' }])
  // Removed 'approvalType' from search for RH1

  // Sort the filtered approvals
  const sortedApprovals = useMemo(() => {
    const sorted = [...filteredApprovals]
    sorted.sort((a, b) => {
      const aValue = getSortValue(a, sortColumn)
      const bValue = getSortValue(b, sortColumn)

      if (aValue === undefined && bValue === undefined) return 0
      if (aValue === undefined) return 1
      if (bValue === undefined) return -1

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        const comparison = aValue.localeCompare(bValue)
        return sortDirection === 'asc' ? comparison : -comparison
      }

      const comparison = (aValue as number) - (bValue as number)
      return sortDirection === 'asc' ? comparison : -comparison
    })
    return sorted
  }, [filteredApprovals, sortColumn, sortDirection])

  const queryState = useQueryState(approvalsQuery, 'Error loading approvals')

  // Show query state (loading/error)
  if (queryState) {
    return (
      <AppPage>
        <AppPageHeader title="Approvals" />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>{queryState}</CompassPanel>
        </StackItem>
      </AppPage>
    )
  }

  const toggleRow = (approvalId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(approvalId)) {
        next.delete(approvalId)
      } else {
        next.add(approvalId)
      }
      return next
    })
  }

  // Check if all rows are currently expanded
  const allRowsExpanded = sortedApprovals.length > 0 && expandedRows.size === sortedApprovals.length
  const collapseAllAriaLabel = allRowsExpanded ? 'Collapse all' : 'Expand all'

  const onCollapseAll = (_event: unknown, _rowIndex: number, isOpen: boolean) => {
    setExpandedRows(isOpen ? new Set(sortedApprovals.map((a) => a.id)) : new Set())
  }

  return (
    <AppPage>
      <AppPageHeader title="Approvals">
        <SearchInput
          placeholder="Search approvals..."
          value={search}
          onChange={(_event, value) => setSearch(value)}
          onClear={() => setSearch('')}
          style={{ width: '250px' }}
        />
      </AppPageHeader>
      {filteredApprovals.length === 0 ? (
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>
            {search ? (
              <EmptyStateFilter clearAllFilters={() => setSearch('')} />
            ) : (
              <EmptyStateNoData
                title="No approvals found"
                description="No approvals are currently pending or available."
              />
            )}
          </CompassPanel>
        </StackItem>
      ) : (
        <ScrollableTableContainer
          aria-label="Approvals table"
          isExpandable
          footer={{
            content: (
              <>
                {filteredApprovals.length} {filteredApprovals.length === 1 ? 'approval' : 'approvals'}
                {approvalsQuery.data?.total && approvalsQuery.data.total > filteredApprovals.length && (
                  <span style={{ opacity: 0.6 }}> (of {approvalsQuery.data.total} total)</span>
                )}
              </>
            ),
            prev: approvalsQuery.data?.prev ?? null,
            next: approvalsQuery.data?.next ?? null,
            onPrev: () => setCursor(approvalsQuery.data?.prev ?? null),
            onNext: () => setCursor(approvalsQuery.data?.next ?? null),
          }}
        >
          <Thead>
            <Tr>
              <Th
                expand={{
                  // PatternFly's areAllExpanded expects the inverse: true when we want to show "expand" state,
                  // false when we want to show "collapse" state (i.e., when all rows are expanded)
                  // The Icon, Aria Label, and behavior all work properly like this.
                  areAllExpanded: !allRowsExpanded,
                  collapseAllAriaLabel,
                  onToggle: onCollapseAll,
                }}
                aria-label="Row expansion"
              />
              <Th modifier="nowrap" sort={getSortParams(0)}>
                Approval name
              </Th>
              {/* Approval type column removed for RH1 - may be added back later */}
              <Th modifier="nowrap" sort={getSortParams(1)}>
                Automation
              </Th>
              <Th modifier="nowrap" sort={getSortParams(2)}>
                Approval initiated
              </Th>
              <Th modifier="nowrap" sort={getSortParams(3)}>
                Actioned on
              </Th>
              <Th modifier="nowrap" sort={getSortParams(4)}>
                Status
              </Th>
            </Tr>
          </Thead>
          <Tbody>
            {sortedApprovals.map((approval, index) => {
              const isExpanded = expandedRows.has(approval.id)

              return (
                <>
                  <Tr key={approval.id} isContentExpanded={isExpanded}>
                    <Td
                      expand={{
                        rowIndex: index,
                        isExpanded,
                        onToggle: () => toggleRow(approval.id),
                      }}
                    />
                    <Td dataLabel="Approval name">
                      <LinkCell href={`/approvals/${approval.id}`}>{approval.approvalName || approval.id}</LinkCell>
                    </Td>
                    {/* Approval type column removed for RH1 - may be added back later */}
                    {/* <Td dataLabel="Approval type">{approval.approvalType || 'Approval'}</Td> */}
                    <Td dataLabel="Automation">
                      {approval.workflowId ? (
                        <LinkCell href={`/automation-builder/${approval.workflowId}`}>
                          {approval.automationName}
                        </LinkCell>
                      ) : (
                        approval.automationName
                      )}
                    </Td>
                    <Td dataLabel="Approval initiated">
                      {/* Use createdAt from BaseResource (represents when approval was requested) */}
                      <DateCell dateString={approval.createdAt} />
                    </Td>
                    <Td dataLabel="Actioned on">
                      <DecidedCell approval={approval} />
                    </Td>
                    <Td dataLabel="Status">
                      <ApprovalStatusBadges status={approval.status} />
                    </Td>
                  </Tr>
                  <Tr key={`${approval.id}-expanded`} isExpanded={isExpanded}>
                    <Td colSpan={6}>
                      <ExpandableRowContent>
                        <DescriptionList>
                          <DescriptionListGroup>
                            <DescriptionListTerm>Description</DescriptionListTerm>
                            <DescriptionListDescription>
                              {(approval as unknown as { description?: string | null }).description ||
                                'No description provided'}
                            </DescriptionListDescription>
                          </DescriptionListGroup>
                        </DescriptionList>
                      </ExpandableRowContent>
                    </Td>
                  </Tr>
                </>
              )
            })}
          </Tbody>
        </ScrollableTableContainer>
      )}
    </AppPage>
  )
}
