import { createRoute } from '@tanstack/react-router'

import {
  AccessManagement,
  CreateUser,
  EditUser,
  GroupDetail,
  ProjectDetail,
  ServiceAccountDetail,
  TransferIdentityWizard,
  UserDetail,
} from '../lazyRoutes'
import { makeRouteComponent } from '../makeRouteComponent'
import { listSearchParams } from '../routeSearchParams'

import { rootRoute } from './__root'

const accessMgmtSearch = listSearchParams.catch({})

export const accessManagementRoutes = [
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/system-administration/access-management',
    validateSearch: accessMgmtSearch,
    component: makeRouteComponent(<AccessManagement />),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/system-administration/access-management/users',
    validateSearch: accessMgmtSearch,
    component: makeRouteComponent(<AccessManagement />),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/system-administration/access-management/users/create',
    component: makeRouteComponent(<CreateUser />, { action: 'create', resourceType: 'user' }),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/system-administration/access-management/users/$userId/edit',
    component: makeRouteComponent(<EditUser />, { action: 'update', resourceType: 'user' }),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/system-administration/access-management/users/$userId/transfer-identity',
    component: makeRouteComponent(<TransferIdentityWizard />),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/system-administration/access-management/users/$userId',
    component: makeRouteComponent(<UserDetail />),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/system-administration/access-management/users/$userId/$tab',
    component: makeRouteComponent(<UserDetail />),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/system-administration/access-management/groups',
    validateSearch: accessMgmtSearch,
    component: makeRouteComponent(<AccessManagement />),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/system-administration/access-management/groups/$groupId',
    component: makeRouteComponent(<GroupDetail />),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/system-administration/access-management/groups/$groupId/$tab',
    component: makeRouteComponent(<GroupDetail />),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/system-administration/access-management/policies',
    validateSearch: accessMgmtSearch,
    component: makeRouteComponent(<AccessManagement />),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/system-administration/access-management/roles',
    component: makeRouteComponent(<AccessManagement />),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/system-administration/access-management/projects',
    validateSearch: accessMgmtSearch,
    component: makeRouteComponent(<AccessManagement />),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/system-administration/access-management/projects/$projectId',
    component: makeRouteComponent(<ProjectDetail />),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/system-administration/access-management/projects/$projectId/$tab',
    component: makeRouteComponent(<ProjectDetail />),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/system-administration/access-management/service-accounts',
    validateSearch: accessMgmtSearch,
    component: makeRouteComponent(<AccessManagement />),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/system-administration/access-management/service-accounts/$serviceAccountId',
    component: makeRouteComponent(<ServiceAccountDetail />),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/system-administration/access-management/service-accounts/$serviceAccountId/$tab',
    component: makeRouteComponent(<ServiceAccountDetail />),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/system-administration/access-management/assignments',
    component: makeRouteComponent(<AccessManagement />),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/system-administration/access-management/check-access',
    component: makeRouteComponent(<AccessManagement />),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/system-administration/access-management/token-revocation',
    component: makeRouteComponent(<AccessManagement />),
  }),
]
