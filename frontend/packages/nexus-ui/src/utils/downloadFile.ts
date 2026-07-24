import { filesFetchClient } from '../client'

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function filenameFromContentDisposition(disposition: string | null, fallback: string): string {
  const match = disposition?.match(/filename="?([^";]+)"?/i)
  return match?.[1]?.trim() || fallback
}

/**
 * Download a stored file by ID via GET /files/{file_id}/download.
 * Uses the Content-Disposition filename when present so the original name is retained.
 * Pass an AbortSignal to cancel the in-flight request.
 */
export async function downloadFileById(
  fileId: string,
  fallbackFilename: string,
  signal?: AbortSignal
): Promise<string> {
  const result = await filesFetchClient.GET('/files/{file_id}/download', {
    params: { path: { file_id: fileId } },
    parseAs: 'blob',
    signal,
  })

  if (result.error || !result.data) {
    throw new Error('Failed to download file')
  }

  const filename = filenameFromContentDisposition(result.response.headers.get('content-disposition'), fallbackFilename)
  triggerBrowserDownload(result.data, filename)
  return filename
}
