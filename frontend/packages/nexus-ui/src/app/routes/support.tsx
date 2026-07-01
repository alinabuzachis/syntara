import { createRoute } from '@tanstack/react-router'

import { Glossary } from '../lazyRoutes'
import { makeRouteComponent } from '../makeRouteComponent'

import { rootRoute } from './__root'

export const supportRoutes = [
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/support/glossary',
    component: makeRouteComponent(<Glossary />),
  }),
]
