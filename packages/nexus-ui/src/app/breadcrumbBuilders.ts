import { AppRoute } from './AppRoute'
import type { AppBreadcrumbItem } from './breadcrumbs/appBreadcrumbItem'

const LABEL_ACCESS_MANAGEMENT = 'Access management'
const LABEL_IDENTITY_PROVIDERS = 'Identity providers'
const LABEL_CONFIGURATION = 'Configuration'
const LABEL_APPROVALS = 'Approvals'

function crumbAccessManagement(): AppBreadcrumbItem {
  return { label: LABEL_ACCESS_MANAGEMENT, href: AppRoute.AccessManagement.Root }
}

function crumbUsersList(): AppBreadcrumbItem {
  return { label: 'Users', href: AppRoute.AccessManagement.Users }
}

function crumbGroupsList(): AppBreadcrumbItem {
  return { label: 'Groups', href: AppRoute.AccessManagement.Groups }
}

function crumbProjectsList(): AppBreadcrumbItem {
  return { label: 'Projects', href: AppRoute.AccessManagement.Projects }
}

function crumbIdentityProvidersList(): AppBreadcrumbItem {
  return { label: LABEL_IDENTITY_PROVIDERS, href: AppRoute.SystemAdministration.Authentication.Root }
}

function crumbConfiguration(): AppBreadcrumbItem {
  return { label: LABEL_CONFIGURATION, href: AppRoute.Configuration.Integrations.Root }
}

function crumbIntegrations(): AppBreadcrumbItem {
  return { label: 'Integrations', href: AppRoute.Configuration.Integrations.Root }
}

function crumbCredentials(): AppBreadcrumbItem {
  return { label: 'Credentials', href: AppRoute.Configuration.Credentials.Root }
}

function crumbSettings(): AppBreadcrumbItem {
  return { label: 'Settings', href: AppRoute.SystemAdministration.Settings }
}

function crumbApprovals(): AppBreadcrumbItem {
  return { label: LABEL_APPROVALS, href: AppRoute.Approvals.Root }
}

function userDetailTabLabel(tab: string): string {
  if (tab === 'details') return 'Details'
  if (tab === 'groups') return 'Groups'
  if (tab === 'identities') return 'Identities'
  if (tab === 'roles') return 'Assignments'
  return tab
}

function groupDetailTabLabel(tab: string): string {
  if (tab === 'details') return 'Details'
  if (tab === 'members') return 'Members'
  if (tab === 'roles') return 'Assignments'
  return tab
}

function projectDetailTabLabel(tab: string): string {
  if (tab === 'details') return 'Details'
  if (tab === 'role-assignments') return 'Assignments'
  return tab
}

function identityProviderDetailTabLabel(tab: string): string {
  if (tab === 'group-mapping') return 'Group mapping'
  return 'Details'
}

export function breadcrumbsAccessManagementHub(activeTabLabel: string): AppBreadcrumbItem[] {
  return [crumbAccessManagement(), { label: activeTabLabel }]
}

export function breadcrumbsIdentityProvidersPage(): AppBreadcrumbItem[] {
  return [{ label: LABEL_IDENTITY_PROVIDERS }]
}

export function breadcrumbsCreateUser(): AppBreadcrumbItem[] {
  return [crumbAccessManagement(), crumbUsersList(), { label: 'Create user' }]
}

export function breadcrumbsEditUser(displayName: string, userBasePath: string): AppBreadcrumbItem[] {
  return [crumbAccessManagement(), crumbUsersList(), { label: displayName, href: userBasePath }, { label: 'Edit user' }]
}

/** `useUrlTab` default; URL with no trailing segment is the same as this tab — omit a redundant last crumb. */
const DEFAULT_ENTITY_TAB = 'details'

export function breadcrumbsUserDetail(
  displayName: string,
  userBasePath: string,
  tab: string,
  options?: { showParentCrumbs?: boolean }
): AppBreadcrumbItem[] {
  const showParent = options?.showParentCrumbs ?? true
  const prefix = showParent ? [crumbAccessManagement(), crumbUsersList()] : []
  if (tab === DEFAULT_ENTITY_TAB) {
    return [...prefix, { label: displayName }]
  }
  return [...prefix, { label: displayName, href: userBasePath }, { label: userDetailTabLabel(tab) }]
}

export function breadcrumbsGroupDetail(groupName: string, groupBasePath: string, tab: string): AppBreadcrumbItem[] {
  const prefix = [crumbAccessManagement(), crumbGroupsList()]
  if (tab === DEFAULT_ENTITY_TAB) {
    return [...prefix, { label: groupName }]
  }
  return [...prefix, { label: groupName, href: groupBasePath }, { label: groupDetailTabLabel(tab) }]
}

export function breadcrumbsProjectDetail(
  projectName: string,
  projectBasePath: string,
  tab: string
): AppBreadcrumbItem[] {
  const prefix = [crumbAccessManagement(), crumbProjectsList()]
  if (tab === DEFAULT_ENTITY_TAB) {
    return [...prefix, { label: projectName }]
  }
  return [...prefix, { label: projectName, href: projectBasePath }, { label: projectDetailTabLabel(tab) }]
}

export function breadcrumbsIdentityProviderAdd(): AppBreadcrumbItem[] {
  return [crumbIdentityProvidersList(), { label: 'Add OIDC provider' }]
}

export function breadcrumbsIdentityProviderEdit(providerName: string, detailBasePath: string): AppBreadcrumbItem[] {
  return [crumbIdentityProvidersList(), { label: providerName, href: detailBasePath }, { label: 'Edit OIDC provider' }]
}

export function breadcrumbsIdentityProviderDetail(
  providerName: string,
  detailBasePath: string,
  tab: string
): AppBreadcrumbItem[] {
  const prefix = [crumbIdentityProvidersList()]
  if (tab === DEFAULT_ENTITY_TAB) {
    return [...prefix, { label: providerName }]
  }
  return [...prefix, { label: providerName, href: detailBasePath }, { label: identityProviderDetailTabLabel(tab) }]
}

export function breadcrumbsSettingsCategory(categoryName: string): AppBreadcrumbItem[] {
  return [crumbSettings(), { label: categoryName }]
}

/** Settings page before a category is selected or when only the page title applies. */
export function breadcrumbsSettingsPage(): AppBreadcrumbItem[] {
  return [{ label: 'Settings' }]
}

export function breadcrumbsApprovalDetail(approvalLabel: string): AppBreadcrumbItem[] {
  return [crumbApprovals(), { label: approvalLabel }]
}

export function breadcrumbsIntegrationConfigure(): AppBreadcrumbItem[] {
  return [crumbConfiguration(), crumbIntegrations(), { label: 'Configure integration' }]
}

export function breadcrumbsIntegrationTools(providerName: string): AppBreadcrumbItem[] {
  const label = providerName.trim() === '' ? 'Tools' : `${providerName} tools`
  return [crumbConfiguration(), crumbIntegrations(), { label }]
}

export type CredentialDetailBreadcrumbTab = 'details' | 'workflows'

export function breadcrumbsCredentialDetail(
  credentialId: string,
  credentialName: string,
  tab: CredentialDetailBreadcrumbTab
): AppBreadcrumbItem[] {
  const prefix = [crumbConfiguration(), crumbCredentials()]
  if (tab === 'details') {
    return [...prefix, { label: credentialName }]
  }
  const detailHref = AppRoute.Configuration.Credentials.Detail.replace(':credentialId', credentialId)
  return [...prefix, { label: credentialName, href: detailHref }, { label: 'Workflows' }]
}

export function breadcrumbsCredentialEarlyShell(currentLabel: string): AppBreadcrumbItem[] {
  return [crumbConfiguration(), crumbCredentials(), { label: currentLabel }]
}

/** Generic two-item trail: parent link + current page label (e.g. loading / error titles). */
export function breadcrumbsApprovalsPage(currentLabel: string): AppBreadcrumbItem[] {
  return [crumbApprovals(), { label: currentLabel }]
}

export function breadcrumbsUserFormLoading(currentLabel: string): AppBreadcrumbItem[] {
  return [crumbAccessManagement(), crumbUsersList(), { label: currentLabel }]
}

export function breadcrumbsUserDetailEarlyShell(options?: { showParentCrumbs?: boolean }): AppBreadcrumbItem[] {
  if (options?.showParentCrumbs === false) return []
  return [crumbAccessManagement(), crumbUsersList(), { label: 'User details' }]
}

export function breadcrumbsGroupDetailEarlyShell(): AppBreadcrumbItem[] {
  return [crumbAccessManagement(), crumbGroupsList(), { label: 'Group details' }]
}

export function breadcrumbsProjectDetailEarlyShell(): AppBreadcrumbItem[] {
  return [crumbAccessManagement(), crumbProjectsList(), { label: 'Project details' }]
}

export function breadcrumbsIdentityProviderFormLoading(currentLabel: string): AppBreadcrumbItem[] {
  return [crumbIdentityProvidersList(), { label: currentLabel }]
}

export function breadcrumbsIdentityProviderDetailEarlyShell(): AppBreadcrumbItem[] {
  return [crumbIdentityProvidersList(), { label: 'Identity provider details' }]
}
