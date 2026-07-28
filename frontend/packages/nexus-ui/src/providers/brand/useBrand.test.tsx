import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { BrandProvider } from './BrandProvider'
import { useBrand } from './useBrand'

describe('useBrand', () => {
  it('throws when used outside BrandProvider', () => {
    expect(() => renderHook(() => useBrand())).toThrow('useBrand must be used within BrandProvider')
  })

  it('returns the brand config when inside BrandProvider', () => {
    const { result } = renderHook(() => useBrand(), {
      wrapper: ({ children }) => <BrandProvider>{children}</BrandProvider>,
    })
    expect(result.current.appTitle).toBe('Syntara')
    expect(result.current.logoExpandedLight).toBeDefined()
    expect(result.current.logoExpandedDark).toBeDefined()
    expect(result.current.logoCollapsed).toBeDefined()
    expect(result.current.faviconPath).toBeDefined()
  })
})
