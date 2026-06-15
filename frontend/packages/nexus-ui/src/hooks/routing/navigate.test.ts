import { afterEach, describe, expect, it, vi } from 'vitest'

import { navigate } from './navigate'

describe('navigate', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('is a callable function', () => {
    expect(navigate).toBeTypeOf('function')
  })

  it('pushes to browser history', () => {
    const pushState = vi.spyOn(window.history, 'pushState')

    navigate('/workflows')

    expect(pushState).toHaveBeenCalledWith(null, '', '/workflows')
  })

  it('replaces history entry when replace option is set', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState')

    navigate('/executions', { replace: true })

    expect(replaceState).toHaveBeenCalledWith(null, '', '/executions')
  })
})
