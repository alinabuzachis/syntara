import type { Group } from '@ansible/nexus-contracts'
import {
  Badge,
  Button,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Flex,
  FlexItem,
  Label,
  StackItem,
  Tab,
  TabTitleText,
  Title,
} from '@patternfly/react-core'
import { RhUiEditIcon } from '@patternfly/react-icons'
import { useMemo, useState } from 'react'
import { useParams } from 'wouter'
import { navigate } from 'wouter/use-browser-location'

import { AppPage, AppPageMain } from '../../../app/AppPage'
import { AppPageHeader } from '../../../app/AppPageHeader'
import { AppRoute } from '../../../app/AppRoute'
import { breadcrumbsGroupDetail, breadcrumbsGroupDetailEarlyShell } from '../../../app/breadcrumbBuilders'
import { AppPanel } from '../../../components/AppPanel'
import { useQueryState } from '../../../components/states/useQueryState'
import { UrlTabs } from '../../../components/UrlTabs'
import { useUrlTab } from '../../../hooks/useUrlTab'
import { formatDateTime } from '../../../utils/dateUtils'
import { detachPromise } from '../../../utils/detachPromise'
import { accessClient } from '../../access/accessClient'
import { BUILTIN_AUTHENTICATED_GROUP_NAME } from '../adminConstants'
import { DetailPageShell } from '../DetailPageShell'
import { GroupFormModal } from '../GroupFormModal'
import { RoleAssignmentsPanel } from '../RoleAssignmentsPanel'

import { GroupMembersPanel } from './GroupMembersPanel'
import { GroupNotFoundState } from './GroupNotFoundState'

function GroupDetailsTab({ group }: Readonly<{ group: Group }>) {
  return (
    <DescriptionList isHorizontal isAutoColumnWidths>
      <DescriptionListGroup>
        <DescriptionListTerm>Name</DescriptionListTerm>
        <DescriptionListDescription>
          <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
            <FlexItem>{group.name}</FlexItem>
            {group.is_builtin && <Label isCompact>Built-in</Label>}
          </Flex>
        </DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Description</DescriptionListTerm>
        <DescriptionListDescription>{group.description ?? '-'}</DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Created</DescriptionListTerm>
        <DescriptionListDescription>{formatDateTime(group.created_at)}</DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Updated</DescriptionListTerm>
        <DescriptionListDescription>{formatDateTime(group.updated_at)}</DescriptionListDescription>
      </DescriptionListGroup>
    </DescriptionList>
  )
}

function GroupTabBar({
  basePath,
  isAuthenticated,
  memberCount,
  roleAssignmentCount,
}: Readonly<{
  basePath: string
  isAuthenticated: boolean
  memberCount: number
  roleAssignmentCount: number
}>) {
  const validTabs = useMemo(
    () => (isAuthenticated ? ['details', 'roles'] : ['details', 'members', 'roles']),
    [isAuthenticated]
  )
  return (
    <UrlTabs basePath={basePath} defaultTab="details" validTabs={validTabs} aria-label="Group details">
      <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>} />
      {!isAuthenticated && (
        <Tab
          eventKey="members"
          title={
            <TabTitleText>
              Members <Badge isRead>{memberCount}</Badge>
            </TabTitleText>
          }
        />
      )}
      <Tab
        eventKey="roles"
        title={
          <TabTitleText>
            Role Assignments <Badge isRead>{roleAssignmentCount}</Badge>
          </TabTitleText>
        }
      />
    </UrlTabs>
  )
}

function GroupTabContent({
  group,
  groupId,
  activeTab,
  isAuthenticated,
  onMembersChange,
}: Readonly<{
  group: Group
  groupId: string
  activeTab: string
  isAuthenticated: boolean
  onMembersChange: () => void
}>) {
  return (
    <>
      {activeTab === 'details' && <GroupDetailsTab group={group} />}
      {activeTab === 'members' && !isAuthenticated && (
        <GroupMembersPanel groupId={groupId} onMembershipChange={onMembersChange} />
      )}
      {activeTab === 'roles' && <RoleAssignmentsPanel principalType="group" principalId={groupId} />}
    </>
  )
}

function useGroupQueries(groupId: string | undefined) {
  const groupQuery = accessClient.useQuery(
    'get',
    '/groups/{group_id}',
    { params: { path: { group_id: groupId ?? '' } } },
    { enabled: !!groupId, retry: false }
  )

  const isAuthenticated = groupQuery.data?.name === BUILTIN_AUTHENTICATED_GROUP_NAME

  const membersQuery = accessClient.useQuery(
    'get',
    '/groups/{group_id}/members',
    { params: { path: { group_id: groupId ?? '' } } },
    { enabled: !!groupId && !isAuthenticated }
  )

  const roleAssignmentsQuery = accessClient.useQuery(
    'get',
    '/groups/{group_id}/role-assignments',
    { params: { path: { group_id: groupId ?? '' } } },
    { enabled: !!groupId }
  )

  const membersData = membersQuery.data
  const memberCount = membersData?.total ?? membersData?.resources?.length ?? 0
  const roleAssignmentCount = roleAssignmentsQuery.data?.total ?? roleAssignmentsQuery.data?.resources?.length ?? 0

  return { groupQuery, membersQuery, isAuthenticated, memberCount, roleAssignmentCount }
}

export function GroupDetail() {
  const { groupId } = useParams<{ groupId: string }>()
  const basePath = AppRoute.AccessManagement.GroupDetail.replace(':groupId', groupId ?? '')
  type GroupTab = 'details' | 'members' | 'roles'
  const [activeTab] = useUrlTab<GroupTab>(basePath)
  const [editModalOpen, setEditModalOpen] = useState(false)

  const { groupQuery, membersQuery, isAuthenticated, memberCount, roleAssignmentCount } = useGroupQueries(groupId)

  const navigateBack = () => navigate(AppRoute.AccessManagement.Groups)

  const groupData = groupQuery.data
  const refetchGroup = groupQuery.refetch
  const queryState = useQueryState(groupQuery, {
    title: 'Error loading group',
    onRetry: () => {
      detachPromise(refetchGroup())
    },
  })

  if (groupQuery.error) {
    return (
      <DetailPageShell title="Group Details" breadcrumbs={breadcrumbsGroupDetailEarlyShell()}>
        <GroupNotFoundState
          onBack={navigateBack}
          onRetry={() => {
            detachPromise(refetchGroup())
          }}
        />
      </DetailPageShell>
    )
  }

  if (queryState) {
    return (
      <DetailPageShell title="Group Details" breadcrumbs={breadcrumbsGroupDetailEarlyShell()}>
        {queryState}
      </DetailPageShell>
    )
  }

  if (!groupData) return null

  const groupCrumbs = breadcrumbsGroupDetail(groupData.name, basePath, activeTab)

  return (
    <AppPage>
      <AppPageHeader title={<Title headingLevel="h1">{groupData.name}</Title>} breadcrumbs={groupCrumbs}>
        <FlexItem grow={{ default: 'grow' }} />
        {!groupData.is_builtin && (
          <Button variant="secondary" icon={<RhUiEditIcon />} onClick={() => setEditModalOpen(true)}>
            Edit group
          </Button>
        )}
      </AppPageHeader>
      <StackItem style={{ flexShrink: 0 }}>
        <GroupTabBar
          basePath={basePath}
          isAuthenticated={isAuthenticated}
          memberCount={memberCount}
          roleAssignmentCount={roleAssignmentCount}
        />
      </StackItem>
      <AppPageMain>
        <AppPanel isFullHeight>
          <GroupTabContent
            group={groupData as Group}
            groupId={groupId ?? ''}
            activeTab={activeTab}
            isAuthenticated={isAuthenticated}
            onMembersChange={() => {
              detachPromise(membersQuery.refetch())
            }}
          />
        </AppPanel>
      </AppPageMain>

      <GroupFormModal
        group={groupData as Group}
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onSuccess={() => {
          detachPromise(groupQuery.refetch())
        }}
      />
    </AppPage>
  )
}
