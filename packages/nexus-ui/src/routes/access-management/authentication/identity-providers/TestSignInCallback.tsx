import { Content, ContentVariants } from '@patternfly/react-core'
import { useEffect } from 'react'

import { NONCE_STORAGE_KEY, RESULT_STORAGE_KEY } from './useTestSignIn'

/**
 * Lightweight page rendered in the test-signin popup after the OAuth callback.
 *
 * The backend redirects here with base64url-encoded claims in the URL hash.
 * Decodes them, pairs with the opener's nonce, and writes the result to
 * localStorage for the parent window to pick up via polling.
 *
 * The nonce is intentionally not removed here — React StrictMode double-fires
 * effects, so the parent is responsible for cleanup after consuming the result.
 */
export function TestSignInCallback() {
  useEffect(() => {
    const hash = globalThis.location.hash.substring(1)

    if (hash) {
      try {
        const nonce = localStorage.getItem(NONCE_STORAGE_KEY)
        if (!nonce) return

        const json = atob(hash.replace(/-/g, '+').replace(/_/g, '/'))
        const parsed: unknown = JSON.parse(json)

        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return

        localStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify({ type: 'test-signin', nonce, claims: parsed }))
      } catch {
        // ignore decode errors
      }
    }

    globalThis.close()
  }, [])

  return <Content component={ContentVariants.p}>Sign-in complete. This window should close automatically.</Content>
}
