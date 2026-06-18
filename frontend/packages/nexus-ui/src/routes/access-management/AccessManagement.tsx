import { Tab } from '@patternfly/react-core'
import { useLayoutEffect, useMemo } from 'react'

import { AppRoute } from '../../app/AppRoute'
import { breadcrumbsAccessManagementHub } from '../../app/breadcrumbBuilders'
import { EmptyStateAccessDenied } from '../../components/EmptyStateAccessDenied'
import { NxPage, NxPageBody } from '../../components/layout/NxPage'
import { NxPageHeader } from '../../components/layout/NxPageHeader'
import { NxPanel } from '../../components/layout/NxPanel'
import { NxListPanel, NxListPanelTabs, NxListPanelView } from '../../components/panels/list/NxListPanel'
import { useLocation } from '../../hooks/routing/useLocation'
import { useNavigate } from '../../hooks/routing/useNavigate'
import { useUrlTab } from '../../hooks/useUrlTab'
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

type AccessTab = 'users' | 'groups' | 'projects' | 'policies' | 'roles' | 'assignments' | 'can-i' | 'token-revocation'

type TabDef = { key: AccessTab; label: string }

const allTabDefs: TabDef[] = [
  { key: 'users', label: 'Users' },
  { key: 'groups', label: 'Groups' },
  { key: 'projects', label: 'Projects' },
  { key: 'policies', label: 'Policies' },
  { key: 'roles', label: 'Roles' },
  { key: 'assignments', label: 'Assignments' },
  { key: 'can-i', label: 'Can I?' },
  { key: 'token-revocation', label: 'Token Revocation' },
]

const basePath = AppRoute.AccessManagement.Root

const noop = () => {}

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

  const [activeTab] = useUrlTab<AccessTab>(basePath, 'users')

  const validTabDefs = useMemo<TabDef[]>(() => {
    if (isLoading) return allTabDefs
    const hiddenKeys = new Set<AccessTab>()
    if (!canReadUsers) hiddenKeys.add('users')
    if (!canReadGroups) hiddenKeys.add('groups')
    if (!canReadProjects) hiddenKeys.add('projects')
    if (!canReadAssignments) hiddenKeys.add('assignments')
    if (!canReadTokenRevocation) hiddenKeys.add('token-revocation')
    if (hiddenKeys.size === 0) return allTabDefs
    return allTabDefs.filter((tab) => !hiddenKeys.has(tab.key))
  }, [canReadUsers, canReadGroups, canReadProjects, canReadAssignments, canReadTokenRevocation, isLoading])

  const validTabKeys = useMemo(() => validTabDefs.map((t) => t.key), [validTabDefs])
  const defaultTab = validTabDefs[0]?.key ?? 'users'

  // Redirect from the bare base path to the first allowed tab so the URL always has a tab segment.
  // NxUrlTabs handles restricted-path redirects via its own useEffect.
  useLayoutEffect(() => {
    if (isLoading || !canAccessPage) return
    if (location === basePath) {
      navigate(`${basePath}/${defaultTab}`, { replace: true })
    }
  }, [location, navigate, canAccessPage, isLoading, defaultTab])

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

  const activeTabDef = validTabDefs.find((t) => t.key === activeTab) ?? validTabDefs[0]
  const hubBreadcrumbs = breadcrumbsAccessManagementHub(activeTabDef?.label ?? 'Access Management')

  return (
    <NxPage>
      <NxPageHeader title="Access Management" docLink={accessDocLink} breadcrumbs={hubBreadcrumbs} />
      <NxPageBody>
        <NxListPanel>
          <NxListPanelTabs basePath={basePath} defaultTab={defaultTab} validTabs={validTabKeys}>
            {validTabDefs.map((tab) => (
              <Tab key={tab.key} eventKey={tab.key} title={tab.label} />
            ))}
          </NxListPanelTabs>

          {activeTab === 'users' && <UsersTab />}
          {activeTab === 'groups' && <GroupsTab />}
          {activeTab === 'projects' && <ProjectsTab />}
          {activeTab === 'policies' && <PoliciesTab />}
          {activeTab === 'roles' && <RolesTab />}
          {activeTab === 'assignments' && <AssignmentsTab />}
          {activeTab === 'can-i' && (
            <NxListPanelView
              tabKey="can-i"
              tabLabel="Can I?"
              isPending={false}
              error={null}
              isEmpty={false}
              hasActiveFilters={false}
              onRetry={noop}
              onClearAllFilters={noop}
              body={<CanITab />}
            />
          )}
          {activeTab === 'token-revocation' && (
            <NxListPanelView
              tabKey="token-revocation"
              tabLabel="Token Revocation"
              isPending={false}
              error={null}
              isEmpty={false}
              hasActiveFilters={false}
              onRetry={noop}
              onClearAllFilters={noop}
              body={<TokenRevocationTab />}
            />
          )}
        </NxListPanel>
      </NxPageBody>
    </NxPage>
  )
}
