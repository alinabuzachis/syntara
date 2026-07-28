import { useContext } from 'react'

import type { BrandConfig } from './brandConfig'
import { BrandContext } from './BrandContext'

export function useBrand(): BrandConfig {
  const ctx = useContext(BrandContext)
  if (!ctx) {
    throw new Error('useBrand must be used within BrandProvider')
  }
  return ctx
}
