import { createRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { BuilderEdit, BuilderNew } from '../lazyRoutes'
import { makeRouteComponent } from '../makeRouteComponent'

import { rootRoute } from './__root'

const builderEditSearch = z
  .object({
    fromExecution: z.string().optional(),
    linkExecution: z.string().optional(),
  })
  .catch({})

export const builderRoutes = [
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/workflow-builder/new',
    component: makeRouteComponent(<BuilderNew />),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/workflow-builder/$workflowId',
    validateSearch: builderEditSearch,
    component: makeRouteComponent(<BuilderEdit />),
  }),
]
