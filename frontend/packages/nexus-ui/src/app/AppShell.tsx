import { Compass, CompassContent } from '@patternfly/react-core'

import { SessionTimeoutWarning } from '../components/session/SessionTimeoutWarning'
import { UnsavedChangesProvider } from '../providers/unsaved-changes/UnsavedChangesProvider'

import { AppDockedNav } from './AppDockedNav'
import { AppLogin } from './AppLogin'

/**
 * App chrome: authentication gate, top-level navigation, and the main content area.
 *
 * Rendered as the root layout route component inside TanStack Router's RouterProvider.
 * `UnsavedChangesProvider` lives here so it is always inside a router context.
 */
export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <UnsavedChangesProvider>
      <AppLogin>
        <SessionTimeoutWarning />
        <Compass
          className="pf-m-no-screen-warning bg-deep-space"
          dock={<AppDockedNav />}
          main={<CompassContent role="main">{children}</CompassContent>}
        />
      </AppLogin>
    </UnsavedChangesProvider>
  )
}
