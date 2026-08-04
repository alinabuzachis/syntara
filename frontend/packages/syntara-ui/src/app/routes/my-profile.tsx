import { createRoute } from '@tanstack/react-router'

import { MyProfile } from '../lazyRoutes'
import { makeRouteComponent } from '../makeRouteComponent'

import { rootRoute } from './__root'

export const myProfileRoutes = [
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/my-profile',
    component: makeRouteComponent(<MyProfile />),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/my-profile/$tab',
    component: makeRouteComponent(<MyProfile />),
  }),
]
