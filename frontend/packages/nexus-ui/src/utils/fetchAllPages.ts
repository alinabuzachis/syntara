/**
 * Generic cursor-based pagination for loading full option lists (dropdowns).
 * Not for table views — use `useCursorPagination` there.
 *
 * Backend max page size is 100. Safety caps limit runaway requests.
 */

/** Maximum items per page supported by the backend. */
export const MAX_PAGE_SIZE = 100

/** Max cursor pages to follow (50 × 100 = 5_000 items). */
export const MAX_PAGES = 50

/** Hard cap on total items; beyond this, prefer server-side search/typeahead. */
export const MAX_ITEMS = 5_000

type PaginatedPayload<T> = {
  /** Readonly matches openapi-fetch list payloads; spread below produces mutable copies. */
  resources?: readonly T[] | null
  next?: string | null
}

/** Compatible with openapi-fetch `GET` responses used by access clients. */
export type FetchPageResult<T> = {
  data?: PaginatedPayload<T>
  error?: unknown
}

function clampToCapacity<T>(items: T[], currentCount: number): { clamped: T[]; capped: boolean } {
  const remaining = MAX_ITEMS - currentCount
  if (remaining <= 0) return { clamped: [], capped: true }
  if (items.length >= remaining) return { clamped: items.slice(0, remaining), capped: true }
  return { clamped: items, capped: false }
}

function warnCapReached(count: number): void {
  // eslint-disable-next-line no-console -- intentional operator diagnostic when dataset exceeds UI pattern
  console.warn(
    `fetchAllPages: reached ${count} items (max ${MAX_ITEMS}). ` +
      'Consider server-side search/typeahead for this dataset.'
  )
}

/**
 * Follows `next` cursors until exhausted or safety limits hit.
 * @throws When a page returns an error or missing payload.
 */
export async function fetchAllPages<T>(
  fetchPage: (cursor: string | undefined) => Promise<FetchPageResult<T>>
): Promise<T[]> {
  const allResources: T[] = []
  let cursor: string | undefined
  const seenCursors = new Set<string>()

  for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex++) {
    const result = await fetchPage(cursor)
    const { data, error } = result
    if (error) throw new Error(JSON.stringify(error))
    if (!data) throw new Error('Empty response')

    const resources = [...(data.resources ?? [])]
    const { clamped, capped } = clampToCapacity(resources, allResources.length)
    allResources.push(...clamped)

    if (capped) {
      warnCapReached(allResources.length)
      return allResources
    }

    const next = data.next
    if (next == null || next === '') return allResources
    if (seenCursors.has(next)) {
      throw new Error(`Detected pagination cursor loop: ${next}`)
    }
    seenCursors.add(next)
    cursor = next
  }

  throw new Error(`Pagination exceeded safety limit of ${MAX_PAGES} pages`)
}
