import { describe, expect, it } from 'vitest'

import { getProjectTogglePrefixLabelStyle } from './projectSelectorUtils'

describe('getProjectTogglePrefixLabelStyle', () => {
  it('returns inherit color when disabled', () => {
    const style = getProjectTogglePrefixLabelStyle(true)
    expect(style.color).toBe('inherit')
  })

  it('returns regular text color when enabled', () => {
    const style = getProjectTogglePrefixLabelStyle(false)
    expect(style.color).toContain('--pf-t--global--text--color--regular')
  })

  it('returns regular text color when isDisabled is undefined (enabled by default)', () => {
    const style = getProjectTogglePrefixLabelStyle(undefined)
    expect(style.color).toContain('--pf-t--global--text--color--regular')
  })

  it('includes consistent padding regardless of disabled state', () => {
    const disabledStyle = getProjectTogglePrefixLabelStyle(true)
    const enabledStyle = getProjectTogglePrefixLabelStyle(false)

    expect(disabledStyle.paddingInlineStart).toBe('var(--pf-t--global--spacer--control--horizontal--default)')
    expect(enabledStyle.paddingInlineStart).toBe('var(--pf-t--global--spacer--control--horizontal--default)')

    expect(disabledStyle.paddingInlineEnd).toBe('var(--pf-t--global--spacer--xs)')
    expect(enabledStyle.paddingInlineEnd).toBe('var(--pf-t--global--spacer--xs)')
  })
})
