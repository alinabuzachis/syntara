import { isVersionStatus } from './hooks/useVersionHistory'

export function builderVersionViewHasTitleRowExtras(
  viewedVersionDate?: string | null,
  viewedVersionStatus?: string | null
): boolean {
  return Boolean(viewedVersionDate || (viewedVersionStatus && isVersionStatus(viewedVersionStatus)))
}
