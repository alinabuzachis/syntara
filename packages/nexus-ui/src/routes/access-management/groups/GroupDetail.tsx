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
  Tabs,
  Title,
} from '@patternfly/react-core'
import { RhUiEditIcon } from '@patternfly/react-icons'
import { useState } from 'react'
import { useParams } from 'wouter'
import { navigate } from 'wouter/use-browser-location'

import { AppPage, AppPageMain } from '../../../app/AppPage'
import { AppPageHeader } from '../../../app/AppPageHeader'
import { AppRoute } from '../../../app/AppRoute'
import { breadcrumbsGroupDetail, breadcrumbsGroupDetailEarlyShell } from '../../../app/breadcrumbBuilders'
import { AppPanel } from '../../../components/AppPanel'
import { useQueryState } from '../../../components/states/useQueryState'
import { useDetailTab } from '../../../hooks/useDetailTab'
import { formatDateTime } from '../../../utils/dateUtils'
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
  activeTab,
  onSelect,
  isAuthenticated,
  memberCount,
}: Readonly<{
  activeTab: string
  onSelect: (_event: React.MouseEvent | React.KeyboardEvent, key: string | number) => void
  isAuthenticated: boolean
  memberCount: number
}>) {
  return (
    <Tabs activeKey={activeTab} onSelect={onSelect}>
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
      <Tab eventKey="roles" title={<TabTitleText>Role Assignments</TabTitleText>} />
    </Tabs>
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

export function GroupDetail() {
  const { groupId } = useParams<{ groupId: string }>()
  const basePath = AppRoute.AccessManagement.GroupDetail.replace(':groupId', groupId ?? '')
  type GroupTab = 'details' | 'members' | 'roles'
  const [activeTab, goToTab] = useDetailTab<GroupTab>(basePath)
  const [editModalOpen, setEditModalOpen] = useState(false)

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

  const membersData = membersQuery.data
  const memberCount = membersData?.total ?? membersData?.resources?.length ?? 0

  const navigateBack = () => navigate(AppRoute.AccessManagement.Groups)

  const groupData = groupQuery.data
  const refetchGroup = groupQuery.refetch
  const queryState = useQueryState(groupQuery, {
    title: 'Error loading group',
    onRetry: () => {
      refetchGroup().catch(() => {})
    },
  })

  if (groupQuery.error) {
    return (
      <DetailPageShell title="Group Details" breadcrumbs={breadcrumbsGroupDetailEarlyShell()}>
        <GroupNotFoundState
          onBack={navigateBack}
          onRetry={() => {
            refetchGroup().catch(() => {})
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
          activeTab={activeTab}
          onSelect={(_event, key) => goToTab(key as GroupTab)}
          isAuthenticated={isAuthenticated}
          memberCount={memberCount}
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
              membersQuery.refetch().catch(() => {})
            }}
          />
        </AppPanel>
      </AppPageMain>

      <GroupFormModal
        group={groupData as Group}
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onSuccess={() => {
          groupQuery.refetch().catch(() => {})
        }}
      />
    </AppPage>
  )
}
