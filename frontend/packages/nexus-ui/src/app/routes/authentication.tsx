import { createRoute } from '@tanstack/react-router'

import {
  AddIdentityProvider,
  Authentication,
  EditGroupMapping,
  EditIdentityProvider,
  IdentityProviderDetail,
} from '../lazyRoutes'
import { makeRouteComponent } from '../makeRouteComponent'

import { rootRoute } from './__root'

export const authenticationRoutes = [
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/system-administration/authentication',
    component: makeRouteComponent(<Authentication />),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/system-administration/authentication/identity-providers/add',
    component: makeRouteComponent(<AddIdentityProvider />, { action: 'create', resourceType: 'identity-provider' }),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/system-administration/authentication/identity-providers/$providerId',
    component: makeRouteComponent(<IdentityProviderDetail />),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/system-administration/authentication/identity-providers/$providerId/edit',
    component: makeRouteComponent(<EditIdentityProvider />, { action: 'update', resourceType: 'identity-provider' }),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/system-administration/authentication/identity-providers/$providerId/group-mapping/edit',
    component: makeRouteComponent(<EditGroupMapping />),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/system-administration/authentication/identity-providers/$providerId/$tab',
    component: makeRouteComponent(<IdentityProviderDetail />),
  }),
]
