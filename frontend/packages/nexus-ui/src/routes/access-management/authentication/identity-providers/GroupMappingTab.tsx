import { useMemo } from 'react'

import { navigate } from '../../../../hooks/routing/navigate'
import { useAllGroups } from '../../../access/useAllGroups'
import { BUILTIN_AUTHENTICATED_GROUP_NAME } from '../../adminConstants'

import { EmptyMappingState, ReadOnlyView } from './GroupMappingComponents'
import { toFormEntries, type GroupMappingConfig } from './groupMappingUtils'
import { identityProviderGroupMappingEditPath } from './identityProviderPaths'

type GroupMappingTabProps = {
  providerId: string
  groupMapping: GroupMappingConfig | null | undefined
  /** When true, editing controls are hidden (user has read but not update permission). */
  readOnly?: boolean
}

export function GroupMappingTab({ providerId, groupMapping, readOnly = false }: Readonly<GroupMappingTabProps>) {
  const { groups: allGroupsRaw } = useAllGroups()
  const nexusGroups = useMemo(
    () => allGroupsRaw.filter((g) => g.name !== BUILTIN_AUTHENTICATED_GROUP_NAME),
    [allGroupsRaw]
  )

  const entries = useMemo(() => toFormEntries(groupMapping), [groupMapping])
  const hasEntries = entries.length > 0

  const navigateToEdit = (search?: string) => {
    const path = identityProviderGroupMappingEditPath(providerId)
    navigate(search ? `${path}?${search}` : path)
  }

  if (!hasEntries) {
    return (
      <EmptyMappingState
        onTestSignIn={readOnly ? undefined : () => navigateToEdit('discover=1')}
        onAddManually={readOnly ? undefined : () => navigateToEdit('new=1')}
      />
    )
  }

  return (
    <ReadOnlyView
      entries={entries}
      nexusGroups={nexusGroups}
      onEditMapping={readOnly ? undefined : () => navigateToEdit()}
    />
  )
}
