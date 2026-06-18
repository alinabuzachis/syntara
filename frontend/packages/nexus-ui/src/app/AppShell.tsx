import { Compass, CompassContent } from '@patternfly/react-core'

import { SessionTimeoutWarning } from '../components/session/SessionTimeoutWarning'
import { UnsavedChangesProvider } from '../providers/unsaved-changes/UnsavedChangesProvider'

import { AppDockedNav } from './AppDockedNav'
import { AppLogin } from './AppLogin'

/**
 * Shared app chrome: authentication gate, top-level navigation, and the main
 * content area. Used by both the wouter and TanStack router paths so the
 * visible shell is identical regardless of the active router.
 *
 * `UnsavedChangesProvider` lives here so it is always inside a router context:
 * - TanStack: AppShell is the root layout route component, rendered inside RouterProvider.
 * - Wouter: no Router wrapper is required (wouter reads browser location directly).
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
