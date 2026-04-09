import { EmptyState, EmptyStateBody } from '@patternfly/react-core'
import { RhUiUsersIcon } from '@patternfly/react-icons'
import { Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'

import { usersClient } from '../../../client'
import { useQueryState } from '../../../components/states/useQueryState'
import { ScrollableTableContainer } from '../../../components/table/ScrollableTableContainer'
import { formatDateTime } from '../../../utils/dateUtils'

export function UserGroupsPanel({ userId }: Readonly<{ userId: string }>) {
  const query = usersClient.useQuery('get', '/users/{user_id}/groups', {
    params: { path: { user_id: userId } },
  })

  const groups = query.data?.resources ?? []

  const queryState = useQueryState(query, { title: 'Error loading groups', onRetry: () => void query.refetch() })
  if (queryState) return queryState

  if (groups.length === 0) {
    return (
      <EmptyState headingLevel="h3" titleText="No groups" icon={RhUiUsersIcon}>
        <EmptyStateBody>This user is not a member of any groups.</EmptyStateBody>
      </EmptyState>
    )
  }

  return (
    <ScrollableTableContainer aria-label="User groups table">
      <Thead>
        <Tr>
          <Th>Name</Th>
          <Th>Description</Th>
          <Th>Created</Th>
        </Tr>
      </Thead>
      <Tbody>
        {groups.map((group) => (
          <Tr key={group.id}>
            <Td dataLabel="Name">{group.name}</Td>
            <Td dataLabel="Description">{group.description ?? ''}</Td>
            <Td dataLabel="Created">{formatDateTime(group.created_at)}</Td>
          </Tr>
        ))}
      </Tbody>
    </ScrollableTableContainer>
  )
}
