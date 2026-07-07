import { useQuery } from '@tanstack/react-query'

export type HealthCheckStatus = 'ok' | 'degraded' | 'unconfigured' | 'error'

type HealthzResponse = {
  status: string
  checks: {
    file_storage: HealthCheckStatus
    [key: string]: unknown
  }
}

type UseFileStorageStatusResult = {
  isConfigured: boolean
  isLoading: boolean
  isError: boolean
  status: HealthCheckStatus | undefined
}

function isHealthzResponse(data: unknown): data is HealthzResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'checks' in data &&
    typeof (data as Record<string, unknown>).checks === 'object'
  )
}

const FIVE_MINUTES_MS = 5 * 60 * 1000

export function useFileStorageStatus(): UseFileStorageStatusResult {
  const query = useQuery({
    queryKey: ['health', 'file_storage'],
    queryFn: async () => {
      const response = await fetch('/health')
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`)
      }
      const json: unknown = await response.json()
      if (!isHealthzResponse(json)) {
        throw new Error('Unexpected health check response shape')
      }
      return json
    },
    staleTime: FIVE_MINUTES_MS,
    retry: 1,
  })

  const fileStorageStatus = query.data?.checks.file_storage
  // Fail-open: undefined (network error, loading, malformed response) defaults to configured
  const isConfigured = fileStorageStatus === 'ok' || fileStorageStatus === undefined

  return {
    isConfigured,
    isLoading: query.isLoading,
    isError: query.isError,
    status: fileStorageStatus,
  }
}

export const FILE_STORAGE_UNCONFIGURED_MESSAGE =
  'File uploads are disabled. Contact your platform administrator to configure S3 storage.'

export const FILE_STORAGE_UNAVAILABLE_MESSAGE =
  'File uploads are temporarily unavailable. S3 storage is experiencing issues.'
