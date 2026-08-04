import { AppRoute } from '../../../../app/AppRoute'

export function identityProviderDetailBasePath(providerId: string): string {
  return AppRoute.SystemAdministration.Authentication.IdentityProviderDetail.replace(':providerId', providerId)
}

export function identityProviderGroupMappingTabPath(providerId: string): string {
  return `${identityProviderDetailBasePath(providerId)}/group-mapping`
}

export function identityProviderGroupMappingEditPath(providerId: string): string {
  return `${identityProviderDetailBasePath(providerId)}/group-mapping/edit`
}
