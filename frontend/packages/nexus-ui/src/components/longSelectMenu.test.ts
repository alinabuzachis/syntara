import { describe, expect, it } from 'vitest'

import { LONG_SELECT_MAX_MENU_HEIGHT, longSelectMenuPopperProps } from './longSelectMenu'

describe('longSelectMenu', () => {
  it('caps menu height with a viewport-aware min() value', () => {
    expect(LONG_SELECT_MAX_MENU_HEIGHT).toBe('min(40vh, 25rem)')
  })

  it('enables popper preventOverflow so menus stay in the viewport', () => {
    expect(longSelectMenuPopperProps).toEqual({ preventOverflow: true })
  })
})
