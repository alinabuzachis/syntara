import { describe, expect, it } from 'vitest'

import { logoLoginDark, logoLoginLight } from './loginBrandAssets'

describe('loginBrandAssets', () => {
  it('exports a light login logo', () => {
    expect(logoLoginLight).toBeDefined()
    expect(typeof logoLoginLight).toBe('string')
    expect(logoLoginLight.length).toBeGreaterThan(0)
  })

  it('exports a dark login logo', () => {
    expect(logoLoginDark).toBeDefined()
    expect(typeof logoLoginDark).toBe('string')
    expect(logoLoginDark.length).toBeGreaterThan(0)
  })

  it('uses the same asset for light and dark in the community build', () => {
    expect(logoLoginLight).toBe(logoLoginDark)
  })
})
