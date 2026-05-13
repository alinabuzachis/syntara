import { StackItem, Tab, TabTitleText } from '@patternfly/react-core'
import { useMemo } from 'react'

import { AppPageMain } from '../../app/AppPage'
import { AppRoute } from '../../app/AppRoute'
import { PanelContentStack } from '../../components/PanelContentStack'
import { useQueryState } from '../../components/states/useQueryState'
import { UrlTabs } from '../../components/UrlTabs'
import { useUrlTab } from '../../hooks/useUrlTab'
import { detachPromise } from '../../utils/detachPromise'

import { CheckAccessView } from './CheckAccessView'
import { MyPermissionsView } from './MyPermissionsView'
import { useCanQueryAuthz } from './useCanQueryAuthz'
import { useResourceActions } from './useResourceActions'
import { WhoCanView } from './WhoCanView'

export function CanITab() {
  type CanIMode = 'check' | 'who-can' | 'my-permissions'
  const [mode] = useUrlTab<CanIMode>(AppRoute.AccessManagement.CanI, 'check')

  const { resourceTypes, actionsByResource, isLoading, error, refetch } = useResourceActions()
  const { canQuery: canQueryAuthz, isChecking: isCheckingAuthz } = useCanQueryAuthz()
  const showWhoCanTab = isCheckingAuthz || canQueryAuthz
  const validModes = useMemo<CanIMode[]>(
    () => (showWhoCanTab ? ['check', 'who-can', 'my-permissions'] : ['check', 'my-permissions']),
    [showWhoCanTab]
  )

  const resourceActionsQueryState = useQueryState(
    { isPending: isLoading, error },
    { title: 'Error loading resource actions', onRetry: () => detachPromise(refetch()) }
  )

  return (
    <PanelContentStack hasGutter>
      <StackItem>
        <UrlTabs
          basePath={AppRoute.AccessManagement.CanI}
          defaultTab="check"
          validTabs={validModes}
          aria-label="Access check modes"
          variant="secondary"
        >
          <Tab
            eventKey="check"
            title={<TabTitleText>Check Access</TabTitleText>}
            aria-label="Check if a user can perform an action"
          />
          {showWhoCanTab && (
            <Tab
              eventKey="who-can"
              title={<TabTitleText>Who Can</TabTitleText>}
              aria-label="Find users who can perform an action"
              isDisabled={isCheckingAuthz}
            />
          )}
          <Tab
            eventKey="my-permissions"
            title={<TabTitleText>My Permissions</TabTitleText>}
            aria-label="View all permissions for a user"
          />
        </UrlTabs>
      </StackItem>

      <AppPageMain style={mode !== 'my-permissions' ? { overflow: 'auto' } : undefined}>
        {mode === 'my-permissions' && <MyPermissionsView />}
        {mode !== 'my-permissions' &&
          (resourceActionsQueryState ?? (
            <>
              {mode === 'check' && (
                <CheckAccessView resourceTypes={resourceTypes} actionsByResource={actionsByResource} />
              )}
              {mode === 'who-can' && canQueryAuthz && (
                <WhoCanView resourceTypes={resourceTypes} actionsByResource={actionsByResource} />
              )}
            </>
          ))}
      </AppPageMain>
    </PanelContentStack>
  )
}
