import { describe, expect, it, vi } from 'vitest'

import { fetchAllPages, MAX_ITEMS, MAX_PAGE_SIZE, MAX_PAGES } from './fetchAllPages'

describe('fetchAllPages', () => {
  it('fetches a single page when no next cursor', async () => {
    const items = [{ id: '1' }, { id: '2' }]
    const fetchPage = vi.fn().mockResolvedValue({
      data: { resources: items, next: null },
    })

    const result = await fetchAllPages(fetchPage)

    expect(result).toEqual(items)
    expect(fetchPage).toHaveBeenCalledTimes(1)
    expect(fetchPage).toHaveBeenCalledWith(undefined)
  })

  it('follows cursor through multiple pages', async () => {
    const page1 = [{ id: '1' }]
    const page2 = [{ id: '2' }]
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ data: { resources: page1, next: 'cursor-1' } })
      .mockResolvedValueOnce({ data: { resources: page2, next: null } })

    const result = await fetchAllPages(fetchPage)

    expect(result).toEqual([...page1, ...page2])
    expect(fetchPage).toHaveBeenCalledTimes(2)
    expect(fetchPage).toHaveBeenNthCalledWith(2, 'cursor-1')
  })

  it('throws when API returns an error', async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      data: undefined,
      error: { detail: 'Unauthorized' },
    })

    await expect(fetchAllPages(fetchPage)).rejects.toThrow('{"detail":"Unauthorized"}')
  })

  it('throws on cursor loop', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ data: { resources: [{ id: '1' }], next: 'same' } })
      .mockResolvedValueOnce({ data: { resources: [{ id: '2' }], next: 'same' } })

    await expect(fetchAllPages(fetchPage)).rejects.toThrow('Detected pagination cursor loop: same')
  })

  it('exports limits', () => {
    expect(MAX_PAGE_SIZE).toBe(100)
    expect(MAX_PAGES).toBe(50)
    expect(MAX_ITEMS).toBe(5_000)
  })

  it('stops when MAX_PAGES exhausted', async () => {
    let n = 0
    const fetchPage = vi.fn().mockImplementation(() => {
      n += 1
      return Promise.resolve({
        data: { resources: [{ id: String(n) }], next: `c-${n}` },
      })
    })

    await expect(fetchAllPages(fetchPage)).rejects.toThrow(`Pagination exceeded safety limit of ${MAX_PAGES} pages`)
    expect(fetchPage).toHaveBeenCalledTimes(MAX_PAGES)
  })
})
