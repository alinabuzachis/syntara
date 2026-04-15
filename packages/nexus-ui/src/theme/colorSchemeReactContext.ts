import { createContext } from 'react'

import type { ColorScheme } from './colorScheme'

/** React context value: current scheme, setter, and toggle. */
export type ColorSchemeContextValue = {
  colorScheme: ColorScheme
  setColorScheme: (scheme: ColorScheme) => void
  toggleColorScheme: () => void
}

/** Context for PatternFly light/dark; default `null` outside {@link ColorSchemeProvider}. */
export const ColorSchemeContext = createContext<ColorSchemeContextValue | null>(null)
