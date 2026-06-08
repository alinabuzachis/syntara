import {
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Flex,
  FlexItem,
  Label,
  Switch,
  Truncate,
} from '@patternfly/react-core'
import { RhUiCaretDownIcon, RhUiCaretRightIcon } from '@patternfly/react-icons'
import { ActionsColumn, ExpandableRowContent, Tbody, Td, Tr } from '@patternfly/react-table'
import type { IAction } from '@patternfly/react-table'
import { Fragment } from 'react'

import { AppRoute } from '../../../app/AppRoute'
import groupedTableStyles from '../../../components/groupedTable.module.css'
import { LinkCell } from '../../../components/table/LinkCell'
import type { ProjectRead } from '../../access/types'

import type { Credential, CredentialExtended, CredentialType } from './credentialConstants'
import { UserTimestamp } from './UserTimestamp'

/** Total visible columns including expand toggle and actions. */
const COLUMN_COUNT = 8

type CredentialRowProps = {
  credential: CredentialExtended
  credType: CredentialType | undefined
  rowIndex: number
  isExpanded: boolean
  onToggleRow: (id: string) => void
  getRowActions: (credential: Credential) => IAction[]
  onToggleEnabled: (credential: Credential) => void
}

function CredentialRow({
  credential,
  credType,
  rowIndex,
  isExpanded,
  onToggleRow,
  getRowActions,
  onToggleEnabled,
}: Readonly<CredentialRowProps>) {
  const hasDescription = Boolean(credential.description?.trim())
  return (
    <Tbody isExpanded={isExpanded}>
      <Tr isContentExpanded={isExpanded}>
        <Td
          expand={
            hasDescription
              ? {
                  rowIndex,
                  isExpanded,
                  onToggle: () => onToggleRow(credential.id!),
                }
              : undefined
          }
        />
        <Td dataLabel="Name">
          <LinkCell href={AppRoute.Configuration.Credentials.Detail.replace(':credentialId', credential.id ?? '')}>
            <Truncate content={credential.name} />
          </LinkCell>
        </Td>
        <Td dataLabel="Type">{credType?.name ?? '—'}</Td>
        <Td dataLabel="Workflows">
          {credential.workflow_count != null && credential.workflow_count > 0 ? credential.workflow_count : '—'}
        </Td>
        <Td dataLabel="Created">
          <UserTimestamp user={credential.created_by} timestamp={credential.created_at} inline />
        </Td>
        <Td dataLabel="Last modified">
          <UserTimestamp user={credential.updated_by} timestamp={credential.updated_at} inline />
        </Td>
        <Td dataLabel="State" onClick={(e) => e.stopPropagation()}>
          <Switch
            id={`credential-toggle-${credential.id}`}
            label="Enabled"
            isChecked={credential.enabled}
            onChange={() => onToggleEnabled(credential)}
          />
        </Td>
        <Td isActionCell onClick={(e) => e.stopPropagation()}>
          <ActionsColumn items={getRowActions(credential)} />
        </Td>
      </Tr>
      {hasDescription && (
        <Tr isExpanded={isExpanded}>
          <Td colSpan={COLUMN_COUNT}>
            <ExpandableRowContent>
              <DescriptionList>
                <DescriptionListGroup>
                  <DescriptionListTerm>Description</DescriptionListTerm>
                  <DescriptionListDescription>{credential.description}</DescriptionListDescription>
                </DescriptionListGroup>
              </DescriptionList>
            </ExpandableRowContent>
          </Td>
        </Tr>
      )}
    </Tbody>
  )
}

type ProjectGroup = {
  project: ProjectRead | null
  credentials: CredentialExtended[]
}

type GroupedCredentialsTableBodyProps = {
  groupedCredentials: Map<string, ProjectGroup>
  collapsedProjects: Set<string>
  onToggleProject: (projectId: string) => void
  typeMap: Map<string, CredentialType>
  expandedRows: Set<string>
  onToggleRow: (id: string) => void
  getRowActions: (credential: Credential) => IAction[]
  onToggleEnabled: (credential: Credential) => void
}

export function GroupedCredentialsTableBody({
  groupedCredentials,
  collapsedProjects,
  onToggleProject,
  typeMap,
  expandedRows,
  onToggleRow,
  getRowActions,
  onToggleEnabled,
}: Readonly<GroupedCredentialsTableBodyProps>) {
  const allCredentials = [...groupedCredentials.values()].flatMap(({ credentials }) => credentials)

  return (
    <>
      {[...groupedCredentials.entries()].map(([projectId, { project, credentials }]) => {
        const isCollapsed = collapsedProjects.has(projectId)
        return (
          <Fragment key={projectId}>
            <Tbody>
              <Tr className={groupedTableStyles.groupHeader} onClick={() => onToggleProject(projectId)}>
                <Td colSpan={COLUMN_COUNT}>
                  <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
                    <FlexItem>{isCollapsed ? <RhUiCaretRightIcon /> : <RhUiCaretDownIcon />}</FlexItem>
                    <FlexItem>
                      <strong>{project?.name ?? (projectId === 'unknown' ? 'No project' : projectId)}</strong>
                    </FlexItem>
                    <FlexItem>
                      <Label isCompact color="purple">
                        {credentials.length}
                      </Label>
                    </FlexItem>
                  </Flex>
                </Td>
              </Tr>
            </Tbody>
            {!isCollapsed &&
              credentials.map((credential) => (
                <CredentialRow
                  key={credential.id}
                  credential={credential}
                  credType={typeMap.get(credential.credential_type_id)}
                  rowIndex={allCredentials.indexOf(credential)}
                  isExpanded={expandedRows.has(credential.id!)}
                  onToggleRow={onToggleRow}
                  getRowActions={getRowActions}
                  onToggleEnabled={onToggleEnabled}
                />
              ))}
          </Fragment>
        )
      })}
    </>
  )
}

type FlatCredentialsTableBodyProps = {
  credentials: CredentialExtended[]
  typeMap: Map<string, CredentialType>
  expandedRows: Set<string>
  onToggleRow: (id: string) => void
  getRowActions: (credential: Credential) => IAction[]
  onToggleEnabled: (credential: Credential) => void
}

export function FlatCredentialsTableBody({
  credentials,
  typeMap,
  expandedRows,
  onToggleRow,
  getRowActions,
  onToggleEnabled,
}: Readonly<FlatCredentialsTableBodyProps>) {
  return (
    <>
      {credentials.map((credential, rowIndex) => (
        <CredentialRow
          key={credential.id}
          credential={credential}
          credType={typeMap.get(credential.credential_type_id)}
          rowIndex={rowIndex}
          isExpanded={expandedRows.has(credential.id!)}
          onToggleRow={onToggleRow}
          getRowActions={getRowActions}
          onToggleEnabled={onToggleEnabled}
        />
      ))}
    </>
  )
}
