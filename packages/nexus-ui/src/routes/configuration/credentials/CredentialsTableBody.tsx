import { Content, ContentVariants, Flex, FlexItem, Label, Switch } from '@patternfly/react-core'
import { RhUiCaretDownIcon, RhUiCaretRightIcon, RhUiKeyIcon } from '@patternfly/react-icons'
import { ActionsColumn, Tbody, Td, Tr } from '@patternfly/react-table'
import type { IAction } from '@patternfly/react-table'

import { AppRoute } from '../../../app/AppRoute'
import { LinkCell } from '../../../components/table/LinkCell'
import { UserTimestamp } from '../../../components/UserTimestamp'
import type { ProjectRead } from '../../access/types'

import type { Credential, CredentialExtended, CredentialType } from './credentialConstants'

type CredentialRowProps = {
  credential: CredentialExtended
  credType: CredentialType | undefined
  getRowActions: (credential: Credential) => IAction[]
  onToggleEnabled: (credential: Credential) => void
}

function CredentialRow({ credential, credType, getRowActions, onToggleEnabled }: Readonly<CredentialRowProps>) {
  return (
    <Tr>
      <Td dataLabel="Name">
        <LinkCell href={AppRoute.Configuration.Credentials.Detail.replace(':credentialId', credential.id ?? '')}>
          {credential.name}
        </LinkCell>
        {credential.description && (
          <Content
            component={ContentVariants.small}
            style={{ margin: 0, color: 'var(--pf-t--global--text--color--subtle)' }}
          >
            {credential.description}
          </Content>
        )}
      </Td>
      <Td dataLabel="Type">
        {credType ? (
          <Label variant="outline" isCompact icon={<RhUiKeyIcon />}>
            {credType.name}
          </Label>
        ) : (
          '\u2014'
        )}
      </Td>
      <Td dataLabel="Workflows">
        {credential.workflow_count != null && credential.workflow_count > 0 ? credential.workflow_count : '\u2014'}
      </Td>
      <Td dataLabel="Created">
        <UserTimestamp user={credential.created_by} timestamp={credential.created_at} />
      </Td>
      <Td dataLabel="Last modified">
        <UserTimestamp user={credential.updated_by} timestamp={credential.updated_at} />
      </Td>
      <Td dataLabel="State" onClick={(e) => e.stopPropagation()}>
        <Switch
          id={`credential-toggle-${credential.id}`}
          label="Enabled"
          isChecked={credential.enabled}
          onChange={() => onToggleEnabled(credential)}
          isReversed
        />
      </Td>
      <Td isActionCell onClick={(e) => e.stopPropagation()}>
        <ActionsColumn items={getRowActions(credential)} />
      </Td>
    </Tr>
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
  getRowActions: (credential: Credential) => IAction[]
  onToggleEnabled: (credential: Credential) => void
}

export function GroupedCredentialsTableBody({
  groupedCredentials,
  collapsedProjects,
  onToggleProject,
  typeMap,
  getRowActions,
  onToggleEnabled,
}: Readonly<GroupedCredentialsTableBodyProps>) {
  return (
    <>
      {[...groupedCredentials.entries()].map(([projectId, { project, credentials }]) => (
        <Tbody key={projectId}>
          <Tr
            style={{ backgroundColor: 'rgba(196, 181, 253, 0.05)', cursor: 'pointer' }}
            onClick={() => onToggleProject(projectId)}
          >
            <Td colSpan={7}>
              <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
                <FlexItem>{collapsedProjects.has(projectId) ? <RhUiCaretRightIcon /> : <RhUiCaretDownIcon />}</FlexItem>
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
          {!collapsedProjects.has(projectId) &&
            credentials.map((credential) => (
              <CredentialRow
                key={credential.id}
                credential={credential}
                credType={typeMap.get(credential.credential_type_id)}
                getRowActions={getRowActions}
                onToggleEnabled={onToggleEnabled}
              />
            ))}
        </Tbody>
      ))}
    </>
  )
}

type FlatCredentialsTableBodyProps = {
  credentials: CredentialExtended[]
  typeMap: Map<string, CredentialType>
  getRowActions: (credential: Credential) => IAction[]
  onToggleEnabled: (credential: Credential) => void
}

export function FlatCredentialsTableBody({
  credentials,
  typeMap,
  getRowActions,
  onToggleEnabled,
}: Readonly<FlatCredentialsTableBodyProps>) {
  return (
    <Tbody>
      {credentials.map((credential) => (
        <CredentialRow
          key={credential.id}
          credential={credential}
          credType={typeMap.get(credential.credential_type_id)}
          getRowActions={getRowActions}
          onToggleEnabled={onToggleEnabled}
        />
      ))}
    </Tbody>
  )
}
