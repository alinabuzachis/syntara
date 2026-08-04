import { createContext } from 'react'

import type { BrandConfig } from './brandConfig'

export const BrandContext = createContext<BrandConfig | null>(null)
