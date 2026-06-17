import { StackItem, Tab, Tabs } from '@patternfly/react-core'
import { useLayoutEffect, useMemo } from 'react'

import { AppRoute } from '../../app/AppRoute'
import { breadcrumbsAccessManagementHub } from '../../app/breadcrumbBuilders'
import { EmptyStateAccessDenied } from '../../components/EmptyStateAccessDenied'
import { NxPage, NxPageBody } from '../../components/layout/NxPage'
import { NxPageHeader } from '../../components/layout/NxPageHeader'
import { NxPanel } from '../../components/layout/NxPanel'
import { useLocation } from '../../hooks/routing/useLocation'
import { useNavigate } from '../../hooks/routing/useNavigate'
import { useDocLink } from '../../utils/docs/useDocLink'
import { AssignmentsTab } from '../access/AssignmentsTab'
import { CanITab } from '../access/CanITab'
import { PoliciesTab } from '../access/PoliciesTab'
import { RolesTab } from '../access/RolesTab'

import { GroupsTab } from './GroupsTab'
import { ProjectsTab } from './ProjectsTab'
import { TokenRevocationTab } from './token-revocation/TokenRevocation'
import { useAccessManagementPermissions } from './useAccessManagementPermissions'
import { UsersTab } from './UsersTab'

const allTabs = [
  { path: AppRoute.AccessManagement.Users, label: 'Users', component: UsersTab },
  { path: AppRoute.AccessManagement.Groups, label: 'Groups', component: GroupsTab },
  { path: AppRoute.AccessManagement.Projects, label: 'Projects', component: ProjectsTab },
  { path: AppRoute.AccessManagement.Policies, label: 'Policies', component: PoliciesTab },
  { path: AppRoute.AccessManagement.Roles, label: 'Roles', component: RolesTab },
  { path: AppRoute.AccessManagement.Assignments, label: 'Assignments', component: AssignmentsTab },
  { path: AppRoute.AccessManagement.CanI, label: 'Can I?', component: CanITab },
  { path: AppRoute.AccessManagement.TokenRevocation, label: 'Token Revocation', component: TokenRevocationTab },
]

export function AccessManagement() {
  const accessDocLink = useDocLink('accessControl')
  const location = useLocation()
  const navigate = useNavigate()
  const {
    canReadUsers,
    canReadGroups,
    canReadProjects,
    canReadAssignments,
    canReadTokenRevocation,
    canAccessPage,
    isLoading,
  } = useAccessManagementPermissions()

  const tabs = useMemo(() => {
    if (isLoading) return allTabs
    const hiddenPaths = new Set<string>()
    if (!canReadUsers) hiddenPaths.add(AppRoute.AccessManagement.Users)
    if (!canReadGroups) hiddenPaths.add(AppRoute.AccessManagement.Groups)
    if (!canReadProjects) hiddenPaths.add(AppRoute.AccessManagement.Projects)
    if (!canReadAssignments) hiddenPaths.add(AppRoute.AccessManagement.Assignments)
    if (!canReadTokenRevocation) hiddenPaths.add(AppRoute.AccessManagement.TokenRevocation)
    if (hiddenPaths.size === 0) return allTabs
    return allTabs.filter((tab) => !hiddenPaths.has(tab.path))
  }, [canReadUsers, canReadGroups, canReadProjects, canReadAssignments, canReadTokenRevocation, isLoading])

  const defaultTab = tabs[0]

  const activeTabIndex = tabs.findIndex((tab) => location.startsWith(tab.path))
  const isRestrictedPath = !isLoading && activeTabIndex === -1 && location !== AppRoute.AccessManagement.Root

  useLayoutEffect(() => {
    if (canAccessPage && (location === AppRoute.AccessManagement.Root || isRestrictedPath) && defaultTab) {
      navigate(defaultTab.path, { replace: true })
    }
  }, [location, navigate, defaultTab, isRestrictedPath, canAccessPage])

  if (!isLoading && !canAccessPage) {
    return (
      <NxPage>
        <NxPageHeader title="Access Management" breadcrumbs={[{ label: 'Access Management' }]} />
        <NxPageBody>
          <NxPanel isFullHeight>
            <EmptyStateAccessDenied description="You don't have permission to view access management. Contact your administrator to request access." />
          </NxPanel>
        </NxPageBody>
      </NxPage>
    )
  }

  const resolvedIndex = activeTabIndex === -1 ? 0 : activeTabIndex
  const ActiveTabComponent = tabs[resolvedIndex].component
  const activeTab = tabs[resolvedIndex]
  const hubBreadcrumbs = breadcrumbsAccessManagementHub(activeTab.label)

  const handleTabSelect = (_event: React.MouseEvent, tabIndex: string | number) => {
    const tab = tabs[Number(tabIndex)]
    if (tab) {
      navigate(tab.path)
    }
  }

  return (
    <NxPage>
      <NxPageHeader title="Access Management" docLink={accessDocLink} breadcrumbs={hubBreadcrumbs} />
      <StackItem style={{ flexShrink: 0 }}>
        <Tabs activeKey={resolvedIndex} onSelect={handleTabSelect}>
          {tabs.map((tab, index) => (
            <Tab key={tab.path} eventKey={index} title={tab.label} />
          ))}
        </Tabs>
      </StackItem>
      <NxPageBody>
        <NxPanel isFullHeight>
          <ActiveTabComponent />
        </NxPanel>
      </NxPageBody>
    </NxPage>
  )
}
