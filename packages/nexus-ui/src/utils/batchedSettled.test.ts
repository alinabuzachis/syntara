import { describe, expect, it } from 'vitest'

import { batchedAllSettled } from './batchedSettled'

describe('batchedAllSettled', () => {
  it('returns empty array for empty input', async () => {
    const result = await batchedAllSettled([], (x: number) => Promise.resolve(x * 2))
    expect(result).toEqual([])
  })

  it('processes items and returns settled results', async () => {
    const items = [1, 2, 3]
    const result = await batchedAllSettled(items, (x) => Promise.resolve(x * 2))
    expect(result).toEqual([
      { status: 'fulfilled', value: 2 },
      { status: 'fulfilled', value: 4 },
      { status: 'fulfilled', value: 6 },
    ])
  })

  it('handles rejected promises', async () => {
    const items = [1, 2, 3]
    const result = await batchedAllSettled(items, (x) => {
      if (x === 2) return Promise.reject(new Error('fail'))
      return Promise.resolve(x)
    })
    expect(result[0]).toEqual({ status: 'fulfilled', value: 1 })
    expect(result[1]).toMatchObject({ status: 'rejected' })
    expect(result[2]).toEqual({ status: 'fulfilled', value: 3 })
  })

  it('processes in batches of 5', async () => {
    let maxConcurrent = 0
    let currentConcurrent = 0
    const items = Array.from({ length: 12 }, (_, i) => i)

    await batchedAllSettled(items, async (x) => {
      currentConcurrent++
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
      await new Promise((r) => setTimeout(r, 10))
      currentConcurrent--
      return x
    })

    expect(maxConcurrent).toBeLessThanOrEqual(5)
  })
})
