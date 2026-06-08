import { useContext } from 'react'

import { ColorSchemeContext, type ColorSchemeContextValue } from './colorSchemeReactContext'

/**
 * Returns the current color scheme and controls from {@link ColorSchemeContext}.
 * @throws {Error} If used outside {@link ColorSchemeProvider}.
 */
export function useColorScheme(): ColorSchemeContextValue {
  const ctx = useContext(ColorSchemeContext)
  if (!ctx) {
    throw new Error('useColorScheme must be used within ColorSchemeProvider')
  }
  return ctx
}
