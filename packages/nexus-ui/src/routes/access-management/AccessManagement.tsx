import { StackItem, Tab, Tabs } from '@patternfly/react-core'
import { useLayoutEffect } from 'react'
import { useLocation } from 'wouter'

import { AppRoute } from '../../app/AppRoute'
import { breadcrumbsAccessManagementHub } from '../../app/breadcrumbBuilders'
import { NxPage, NxPageBody } from '../../components/layout/NxPage'
import { NxPageHeader } from '../../components/layout/NxPageHeader'
import { NxPanel } from '../../components/layout/NxPanel'
import { AssignmentsTab } from '../access/AssignmentsTab'
import { CanITab } from '../access/CanITab'
import { PoliciesTab } from '../access/PoliciesTab'
import { RolesTab } from '../access/RolesTab'

import { GroupsTab } from './GroupsTab'
import { ProjectsTab } from './ProjectsTab'
import { UsersTab } from './UsersTab'

const tabs = [
  { path: AppRoute.AccessManagement.Users, label: 'Users', component: UsersTab },
  { path: AppRoute.AccessManagement.Groups, label: 'Groups', component: GroupsTab },
  { path: AppRoute.AccessManagement.Projects, label: 'Projects', component: ProjectsTab },
  { path: AppRoute.AccessManagement.Policies, label: 'Policies', component: PoliciesTab },
  { path: AppRoute.AccessManagement.Roles, label: 'Roles', component: RolesTab },
  { path: AppRoute.AccessManagement.Assignments, label: 'Role Assignments', component: AssignmentsTab },
  { path: AppRoute.AccessManagement.CanI, label: 'Can I?', component: CanITab },
] as const

export function AccessManagement() {
  const [location, navigate] = useLocation()

  useLayoutEffect(() => {
    if (location === AppRoute.AccessManagement.Root) {
      navigate(AppRoute.AccessManagement.Users, { replace: true })
    }
  }, [location, navigate])

  const activeTabIndex = tabs.findIndex((tab) => location.startsWith(tab.path))
  const resolvedIndex = activeTabIndex === -1 ? 0 : activeTabIndex
  const ActiveTabComponent = tabs[resolvedIndex].component
  const activeTab = tabs[resolvedIndex]
  // Default hub tab: same view as `/access-management` (canonical `/access-management/users`); title + tabs suffice.
  const hubBreadcrumbs =
    activeTab.path === AppRoute.AccessManagement.Users ? undefined : breadcrumbsAccessManagementHub(activeTab.label)

  const handleTabSelect = (_event: React.MouseEvent, tabIndex: string | number) => {
    const tab = tabs[Number(tabIndex)]
    if (tab) {
      navigate(tab.path)
    }
  }

  return (
    <NxPage>
      <NxPageHeader title="Access Management" breadcrumbs={hubBreadcrumbs} />
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
