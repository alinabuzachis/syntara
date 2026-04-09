import { useEffect, useState } from 'react'

export interface AuthProvider {
  id: string
  name: string
  provider_type: string
}

function isAuthProvider(value: unknown): value is AuthProvider {
  return (
    value != null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).id === 'string' &&
    typeof (value as Record<string, unknown>).name === 'string'
  )
}

interface UseAuthProvidersResult {
  providers: AuthProvider[]
  isLoading: boolean
}

/**
 * Fetches enabled identity providers from the public /auth/providers endpoint.
 * Uses plain fetch (no auth required). Fails silently — returns empty array on error.
 */
export function useAuthProviders(): UseAuthProvidersResult {
  const [providers, setProviders] = useState<AuthProvider[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()

    void (async () => {
      try {
        const response = await fetch('/api/v1/auth/providers', { signal: controller.signal })
        if (response.ok) {
          const data: unknown = await response.json()
          if (
            !controller.signal.aborted &&
            data != null &&
            typeof data === 'object' &&
            'providers' in data &&
            Array.isArray((data as Record<string, unknown>).providers)
          ) {
            const raw = (data as { providers: unknown[] }).providers
            setProviders(raw.filter(isAuthProvider))
          }
        }
      } catch {
        // Fail silently — local-only login (includes AbortError on unmount)
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    })()

    return () => {
      controller.abort()
    }
  }, [])

  return { providers, isLoading }
}
