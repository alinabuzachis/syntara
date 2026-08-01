import { use } from 'react'

import type { BrandConfig } from './brandConfig'
import { BrandContext } from './BrandContext'

export function useBrand(): BrandConfig {
  const ctx = use(BrandContext)
  if (!ctx) {
    throw new Error('useBrand must be used within BrandProvider')
  }
  return ctx
}
