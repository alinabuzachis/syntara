// Shared reactive useSearchParams mock for tests that exercise filter state.
//
// Use with vi.mock:
//   vi.mock('...hooks/routing/useSearchParams', async () => {
//     const { useState, useEffect } = await import('react')
//     const { searchParamsMock } = await import('...test/searchParamsMock')
//     return {
//       useSearchParams: () => {
//         const [, forceRender] = useState(0)
//         useEffect(() => searchParamsMock.subscribe(() => forceRender((n) => n + 1)), [])
//         return [searchParamsMock.get(), searchParamsMock.set] as const
//       },
//     }
//   })
//
// Call searchParamsMock.reset() in beforeEach to clear state between tests.
let params = new URLSearchParams()
const listeners = new Set<() => void>()

export const searchParamsMock = {
  get: () => params,
  set: (newParams: URLSearchParams) => {
    params = newParams
    listeners.forEach((fn) => fn())
  },
  reset: () => {
    params = new URLSearchParams()
  },
  subscribe: (fn: () => void) => {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },
}
