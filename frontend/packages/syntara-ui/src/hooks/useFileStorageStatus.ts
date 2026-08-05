import type { FilesAPI } from '@syntara/contracts'

import { filesClient } from '../client'

export type HealthCheckStatus = FilesAPI.components['schemas']['FileStorageStatus']

type UseFileStorageStatusResult = {
  isConfigured: boolean
  isLoading: boolean
  isError: boolean
  status: HealthCheckStatus | undefined
}

const FIVE_MINUTES_MS = 5 * 60 * 1000

export function useFileStorageStatus(): UseFileStorageStatusResult {
  const query = filesClient.useQuery(
    'get',
    '/files/storage_status',
    {},
    {
      staleTime: FIVE_MINUTES_MS,
      // staleTime alone only marks cached data stale; it never schedules a
      // refetch. Without this, a page open across an S3 outage keeps its
      // first answer forever — uploads stay disabled after storage recovers,
      // and stay enabled after it breaks. Polling both directions is what
      // makes the gate self-correcting. Paused while the tab is backgrounded.
      refetchInterval: FIVE_MINUTES_MS,
      retry: 1,
    }
  )

  const fileStorageStatus = query.data?.status
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
