export type PublishDisplayStatus = 'published' | 'unpublished_changes' | 'unpublished'

export function derivePublishStatus(
  publishedVersion: number | null | undefined,
  currentVersion: number | undefined
): PublishDisplayStatus {
  if (publishedVersion == null) {
    return 'unpublished'
  }
  if (currentVersion != null && publishedVersion === currentVersion) {
    return 'published'
  }
  return 'unpublished_changes'
}
