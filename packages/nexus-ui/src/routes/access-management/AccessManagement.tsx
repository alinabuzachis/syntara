import { StackItem, Tab, Tabs } from '@patternfly/react-core'
import { useLocation } from 'wouter'

import { AppPage, AppPageMain } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import { AppRoute } from '../../app/AppRoute'
import { AppPanel } from '../../components/AppPanel'
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

  const activeTabIndex = tabs.findIndex((tab) => location.startsWith(tab.path))
  const resolvedIndex = activeTabIndex === -1 ? 0 : activeTabIndex
  const ActiveTabComponent = tabs[resolvedIndex].component

  const handleTabSelect = (_event: React.MouseEvent, tabIndex: string | number) => {
    const tab = tabs[Number(tabIndex)]
    if (tab) {
      navigate(tab.path)
    }
  }

  return (
    <AppPage>
      <AppPageHeader title="Access Management" />
      <StackItem style={{ flexShrink: 0 }}>
        <Tabs activeKey={resolvedIndex} onSelect={handleTabSelect}>
          {tabs.map((tab, index) => (
            <Tab key={tab.path} eventKey={index} title={tab.label} />
          ))}
        </Tabs>
      </StackItem>
      <AppPageMain>
        <AppPanel isFullHeight>
          <ActiveTabComponent />
        </AppPanel>
      </AppPageMain>
    </AppPage>
  )
}
