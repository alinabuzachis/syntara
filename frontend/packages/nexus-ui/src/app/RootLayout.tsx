import { Outlet } from '@tanstack/react-router'

import { AppShell } from './AppShell'

/** Root layout: app chrome (auth gate, nav, Compass) with a router outlet for page content. */
export function RootLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
