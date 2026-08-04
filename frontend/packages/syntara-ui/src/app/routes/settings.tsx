import { createRoute } from '@tanstack/react-router'

import { Settings } from '../lazyRoutes'
import { makeRouteComponent } from '../makeRouteComponent'

import { rootRoute } from './__root'

export const settingsRoutes = [
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/system-administration/settings',
    component: makeRouteComponent(<Settings />),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/system-administration/settings/$category',
    component: makeRouteComponent(<Settings />),
  }),
]
