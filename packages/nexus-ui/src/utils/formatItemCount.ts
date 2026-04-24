/**
 * Build a human-readable item-count string such as "3 policies" or "2 roles of 40".
 * Handles singular/plural and an optional total when the displayed page is a subset.
 */
export function formatItemCount(count: number, singular: string, plural: string, total?: number | null): string {
  const label = count === 1 ? singular : plural
  const base = `${count} ${label}`
  if (total != null && total > count) {
    return `${base} of ${total}`
  }
  return base
}
