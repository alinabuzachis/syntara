/**
 * Color scheme: PatternFly `pf-v6-theme-dark` on `<html>` selects light vs dark.
 * `pf-v6-theme-glass` stays on for both themes (set in `index.html`); runtime only toggles `pf-v6-theme-dark`.
 * Keep `resolveColorScheme` and `applyDocumentColorScheme` in sync with the inline script in `packages/syntara-ui/index.html`.
 */
/** `localStorage` key for persisted light/dark preference. */
export const COLOR_SCHEME_STORAGE_KEY = 'syntara-ui-color-scheme'

/** Resolved appearance: PatternFly light (no `pf-v6-theme-dark`) or dark. */
export type ColorScheme = 'light' | 'dark'

/** Returns a valid stored scheme, or `null` if missing, invalid, or storage is unavailable. */
export function readStoredColorScheme(): ColorScheme | null {
  try {
    const value = globalThis.localStorage?.getItem(COLOR_SCHEME_STORAGE_KEY)
    if (value === 'light' || value === 'dark') {
      return value
    }
  } catch {
    // Storage may be unavailable (private mode, SSR).
  }
  return null
}

/**
 * Effective scheme: stored preference, else `prefers-color-scheme`, else `dark`.
 * Must stay aligned with `index.html` inline bootstrap script.
 */
export function resolveColorScheme(): ColorScheme {
  const stored = readStoredColorScheme()
  if (stored) {
    return stored
  }
  try {
    if (globalThis.matchMedia?.('(prefers-color-scheme: light)').matches) {
      return 'light'
    }
    if (globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches) {
      return 'dark'
    }
  } catch {
    // matchMedia may be unavailable.
  }
  return 'dark'
}

/** Reads the active scheme from `document.documentElement` (`pf-v6-theme-dark`). */
export function getColorSchemeFromDocument(): ColorScheme {
  return document.documentElement.classList.contains('pf-v6-theme-dark') ? 'dark' : 'light'
}

/**
 * Sets or clears `pf-v6-theme-dark` on `<html>` to match `scheme`.
 * Does not remove `pf-v6-theme-glass` — the glass shell is intentional for both light and dark.
 */
export function applyDocumentColorScheme(scheme: ColorScheme): void {
  document.documentElement.classList.toggle('pf-v6-theme-dark', scheme === 'dark')
}

/** Writes `scheme` to `localStorage` under {@link COLOR_SCHEME_STORAGE_KEY}; no-ops if storage fails. */
export function persistColorScheme(scheme: ColorScheme): void {
  try {
    globalThis.localStorage?.setItem(COLOR_SCHEME_STORAGE_KEY, scheme)
  } catch {
    // ignore
  }
}

/**
 * Applies {@link resolveColorScheme} to the document. Idempotent; safe on every load
 * (inline `index.html` script + `main.tsx` init).
 */
export function ensureDocumentColorScheme(): void {
  applyDocumentColorScheme(resolveColorScheme())
}
