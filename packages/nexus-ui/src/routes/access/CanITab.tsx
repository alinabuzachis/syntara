import { Stack, StackItem, Tab, Tabs, TabTitleText } from '@patternfly/react-core'

import { AppPageMain } from '../../app/AppPage'
import { AppRoute } from '../../app/AppRoute'
import { useDetailTab } from '../../hooks/useDetailTab'

import { CheckAccessView } from './CheckAccessView'
import { MyPermissionsView } from './MyPermissionsView'
import { useAllPolicies } from './useAllPolicies'
import { useCanQueryAuthz } from './useCanQueryAuthz'
import { WhoCanView } from './WhoCanView'

export function CanITab() {
  type CanIMode = 'check' | 'who-can' | 'my-permissions'
  const [mode, goToMode] = useDetailTab<CanIMode>(AppRoute.AccessManagement.CanI, 'check')

  const { policies } = useAllPolicies()
  const canQueryAuthz = useCanQueryAuthz()

  return (
    <Stack hasGutter style={{ height: '100%' }}>
      <StackItem>
        <Tabs
          activeKey={mode}
          onSelect={(_event, key) => goToMode(key as CanIMode)}
          aria-label="Access check modes"
          variant="secondary"
        >
          <Tab
            eventKey="check"
            title={<TabTitleText>Check Access</TabTitleText>}
            aria-label="Check if a user can perform an action"
          />
          {canQueryAuthz && (
            <Tab
              eventKey="who-can"
              title={<TabTitleText>Who Can</TabTitleText>}
              aria-label="Find users who can perform an action"
            />
          )}
          <Tab
            eventKey="my-permissions"
            title={<TabTitleText>My Permissions</TabTitleText>}
            aria-label="View all permissions for a user"
          />
        </Tabs>
      </StackItem>

      <AppPageMain style={{ overflow: 'auto' }}>
        {mode === 'check' && <CheckAccessView policies={policies} />}
        {mode === 'who-can' && canQueryAuthz && <WhoCanView policies={policies} />}
        {mode === 'my-permissions' && <MyPermissionsView />}
      </AppPageMain>
    </Stack>
  )
}
