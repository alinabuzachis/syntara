import {
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Flex,
  FlexItem,
  Label,
} from '@patternfly/react-core'
import { RhUiCaretDownIcon, RhUiCaretRightIcon } from '@patternfly/react-icons'
import { Tbody, Td, Tr, ExpandableRowContent } from '@patternfly/react-table'
import { Fragment } from 'react'

import { DateCell } from '../../components/table/DateCell'
import { LinkCell } from '../../components/table/LinkCell'
import type { ProjectRead } from '../access/types'

import type { ApprovalWithDetails } from './Approvals'
import { ApprovalStatusBadges } from './approvalUtils'

function DecidedCell({ approval }: Readonly<{ approval: ApprovalWithDetails }>) {
  const decidedAt = approval.decided_at
  const decidedBy = approval.decided_by

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

function ApprovalRow({
  approval,
  rowIndex,
  isExpanded,
  onToggleRow,
}: Readonly<{
  approval: ApprovalWithDetails
  rowIndex: number
  isExpanded: boolean
  onToggleRow: (id: string) => void
}>) {
  return (
    <Fragment key={approval.id}>
      <Tr isContentExpanded={isExpanded}>
        <Td
          expand={{
            rowIndex,
            isExpanded,
            onToggle: () => onToggleRow(approval.id),
          }}
        />
        <Td dataLabel="Approval name">
          <LinkCell href={`/approvals/${approval.id}`}>{approval.approvalName || approval.id}</LinkCell>
        </Td>
        <Td dataLabel="Workflow">
          {approval.workflowId ? (
            <LinkCell href={`/workflow-builder/${approval.workflowId}`}>
              {approval.workflowName || approval.workflowId}
            </LinkCell>
          ) : (
            (approval.workflowName ?? '—')
          )}
        </Td>
        <Td dataLabel="Approval initiated">
          <DateCell dateString={approval.created_at} />
        </Td>
        <Td dataLabel="Actioned on">
          <DecidedCell approval={approval} />
        </Td>
        <Td dataLabel="Status">
          <ApprovalStatusBadges status={approval.status} />
        </Td>
      </Tr>
      <Tr isExpanded={isExpanded}>
        <Td colSpan={6}>
          <ExpandableRowContent>
            <DescriptionList>
              <DescriptionListGroup>
                <DescriptionListTerm>Description</DescriptionListTerm>
                <DescriptionListDescription>
                  {approval.description || 'No description provided'}
                </DescriptionListDescription>
              </DescriptionListGroup>
            </DescriptionList>
          </ExpandableRowContent>
        </Td>
      </Tr>
    </Fragment>
  )
}

type ProjectGroup = {
  project: ProjectRead | null
  approvals: ApprovalWithDetails[]
}

type GroupedApprovalsTableBodyProps = {
  groupedApprovals: Map<string, ProjectGroup>
  collapsedProjects: Set<string>
  onToggleProject: (projectId: string) => void
  expandedRows: Set<string>
  onToggleRow: (id: string) => void
}

export function GroupedApprovalsTableBody({
  groupedApprovals,
  collapsedProjects,
  onToggleProject,
  expandedRows,
  onToggleRow,
}: Readonly<GroupedApprovalsTableBodyProps>) {
  let rowIndex = 0

  return (
    <>
      {[...groupedApprovals.entries()].map(([projectId, { project, approvals }]) => (
        <Tbody key={projectId}>
          <Tr
            style={{ backgroundColor: 'rgba(196, 181, 253, 0.05)', cursor: 'pointer' }}
            onClick={() => onToggleProject(projectId)}
          >
            <Td colSpan={6}>
              <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
                <FlexItem>{collapsedProjects.has(projectId) ? <RhUiCaretRightIcon /> : <RhUiCaretDownIcon />}</FlexItem>
                <FlexItem>
                  <strong>{project?.name ?? (projectId === 'unknown' ? 'No project' : projectId)}</strong>
                </FlexItem>
                <FlexItem>
                  <Label isCompact color="purple">
                    {approvals.length}
                  </Label>
                </FlexItem>
              </Flex>
            </Td>
          </Tr>
          {!collapsedProjects.has(projectId) &&
            approvals.map((approval) => {
              const currentIndex = rowIndex++
              return (
                <ApprovalRow
                  key={approval.id}
                  approval={approval}
                  rowIndex={currentIndex}
                  isExpanded={expandedRows.has(approval.id)}
                  onToggleRow={onToggleRow}
                />
              )
            })}
        </Tbody>
      ))}
    </>
  )
}

type FlatApprovalsTableBodyProps = {
  approvals: ApprovalWithDetails[]
  expandedRows: Set<string>
  onToggleRow: (id: string) => void
}

export function FlatApprovalsTableBody({
  approvals,
  expandedRows,
  onToggleRow,
}: Readonly<FlatApprovalsTableBodyProps>) {
  return (
    <Tbody>
      {approvals.map((approval, index) => (
        <ApprovalRow
          key={approval.id}
          approval={approval}
          rowIndex={index}
          isExpanded={expandedRows.has(approval.id)}
          onToggleRow={onToggleRow}
        />
      ))}
    </Tbody>
  )
}
