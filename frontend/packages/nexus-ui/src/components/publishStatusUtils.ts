export type PublishDisplayStatus = 'published' | 'unpublished' | 'unpublished_changes'

export function derivePublishStatus(
  publishedVersionId: string | null | undefined,
  currentVersionId?: string | null
): PublishDisplayStatus {
  if (publishedVersionId == null) {
    return 'unpublished'
  }
  if (currentVersionId != null && publishedVersionId !== currentVersionId) {
    return 'unpublished_changes'
  }
  return 'published'
}
