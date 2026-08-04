/**
 * Computes the backend origin and webhook base URL from the VITE_API_URL
 * environment variable. Falls back to the current browser origin when the
 * env var is missing or malformed.
 */

function resolveBackendOrigin(): string {
  const raw: unknown = import.meta.env.VITE_API_URL
  const envUrl = typeof raw === 'string' && raw ? raw : undefined
  if (envUrl) {
    try {
      return new URL(envUrl).origin
    } catch {
      // Malformed URL — fall through to browser origin
    }
  }
  return globalThis.location.origin
}

/** The origin (scheme + host + port) of the backend API server. */
export const backendOrigin = resolveBackendOrigin()

/** Base URL for the webhook reception endpoint (no trailing slash). */
export const WEBHOOK_BASE_URL = `${backendOrigin}/api/v1/webhooks`
