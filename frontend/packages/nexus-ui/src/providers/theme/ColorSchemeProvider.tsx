import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import {
  COLOR_SCHEME_STORAGE_KEY,
  type ColorScheme,
  applyDocumentColorScheme,
  getColorSchemeFromDocument,
  persistColorScheme,
  readStoredColorScheme,
  resolveColorScheme,
} from './colorScheme'
import { ColorSchemeContext } from './colorSchemeReactContext'

/**
 * Provides persisted light/dark theme state, syncs `document.documentElement`, and listens for
 * cross-tab `storage` events and `prefers-color-scheme` when no explicit preference is stored.
 */
export function ColorSchemeProvider(props: Readonly<{ children: ReactNode }>) {
  const [colorScheme, setColorScheme] = useState<ColorScheme>(() => getColorSchemeFromDocument())

  const commitColorScheme = useCallback(
    (scheme: ColorScheme) => {
      persistColorScheme(scheme)
      applyDocumentColorScheme(scheme)
      setColorScheme(scheme)
    },
    [setColorScheme]
  )

  const toggleColorScheme = useCallback(() => {
    commitColorScheme(colorScheme === 'dark' ? 'light' : 'dark')
  }, [colorScheme, commitColorScheme])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      // `key === null` when another tab calls `localStorage.clear()`; sync theme after bulk clear.
      if (event.key !== null && event.key !== COLOR_SCHEME_STORAGE_KEY) {
        return
      }
      const next = resolveColorScheme()
      applyDocumentColorScheme(next)
      setColorScheme(next)
    }

    const media = globalThis.matchMedia?.('(prefers-color-scheme: light)')
    const onPrefChange = () => {
      if (readStoredColorScheme() !== null) {
        return
      }
      const next = resolveColorScheme()
      applyDocumentColorScheme(next)
      setColorScheme(next)
    }

    globalThis.addEventListener('storage', onStorage)
    media?.addEventListener('change', onPrefChange)
    return () => {
      globalThis.removeEventListener('storage', onStorage)
      media?.removeEventListener('change', onPrefChange)
    }
  }, [])

  const value = useMemo(
    () => ({
      colorScheme,
      setColorScheme: commitColorScheme,
      toggleColorScheme,
    }),
    [colorScheme, commitColorScheme, toggleColorScheme]
  )

  return <ColorSchemeContext.Provider value={value}>{props.children}</ColorSchemeContext.Provider>
}
