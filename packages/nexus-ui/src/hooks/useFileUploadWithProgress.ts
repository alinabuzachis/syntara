import type { FilesAPI } from '@ansible/nexus-contracts'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { useState, useCallback, useRef } from 'react'

type FileUploadResponse = FilesAPI.components['schemas']['FileUploadResponse']
type FileUploadError = { error: string; message: string }

/** Creates a FileUploadError with the given code and message. */
export function createUploadError(error: string, message: string): FileUploadError {
  return { error, message }
}

function reportUploadError(
  setError: Dispatch<SetStateAction<FileUploadError | null>>,
  reject: (reason: FileUploadError) => void,
  err: FileUploadError
): void {
  setError(err)
  reject(err)
}

function createProgressHandler(setProgress: Dispatch<SetStateAction<FileProgress[]>>, fileCount: number) {
  return (event: { lengthComputable?: boolean; loaded: number; total: number }) => {
    if (event.lengthComputable && event.total > 0 && fileCount > 0) {
      const totalPercentage = Math.min(100, Math.round((event.loaded / event.total) * 100))
      setProgress((prev) =>
        prev.map((p) => ({
          ...p,
          loaded: Math.min(p.total, Math.round((p.total * totalPercentage) / 100)),
          percentage: totalPercentage,
        }))
      )
    }
  }
}

export function isFileUploadError(value: unknown): value is FileUploadError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { error?: unknown }).error === 'string' &&
    typeof (value as { message?: unknown }).message === 'string'
  )
}

function handleXhrLoad(
  xhr: XMLHttpRequest,
  xhrRef: MutableRefObject<XMLHttpRequest | null>,
  setUploading: Dispatch<SetStateAction<boolean>>,
  setError: Dispatch<SetStateAction<FileUploadError | null>>,
  resolve: (value: FileUploadResponse) => void,
  reject: (reason: FileUploadError) => void
): void {
  setUploading(false)
  xhrRef.current = null

  if (xhr.status >= 200 && xhr.status < 300) {
    try {
      const response: FileUploadResponse = JSON.parse(xhr.responseText)
      resolve(response)
    } catch {
      reportUploadError(setError, reject, createUploadError('parse_error', 'Failed to parse server response'))
    }
  } else {
    try {
      const parsed: unknown = JSON.parse(xhr.responseText)
      if (isFileUploadError(parsed)) {
        reportUploadError(setError, reject, parsed)
      } else {
        reportUploadError(
          setError,
          reject,
          createUploadError('upload_failed', `Upload failed with status ${xhr.status}`)
        )
      }
    } catch {
      reportUploadError(setError, reject, createUploadError('upload_failed', `Upload failed with status ${xhr.status}`))
    }
  }
}

/**
 * Progress information for individual files during upload
 */
export interface FileProgress {
  /** Name of the file being uploaded */
  fileName: string
  /** Bytes uploaded so far */
  loaded: number
  /** Total bytes to upload */
  total: number
  /** Upload percentage (0-100) */
  percentage: number
}

/**
 * Result type for the useFileUploadWithProgress hook
 */
export interface UseFileUploadWithProgressResult {
  /** Function to upload files with progress tracking */
  uploadFiles: (files: File[]) => Promise<FileUploadResponse>
  /** Whether an upload is currently in progress */
  uploading: boolean
  /** Progress information for each file being uploaded */
  progress: FileProgress[]
  /** Error information if upload fails */
  error: FileUploadError | null
  /** Function to cancel the current upload */
  cancelUpload: () => void
  /** Function to reset the hook state */
  reset: () => void
}

/**
 * Custom hook for uploading files to the Files API with progress tracking.
 *
 * Uses XMLHttpRequest instead of fetch to support upload progress events.
 * The native fetch API does not support progress tracking for uploads.
 *
 * @example
 * ```tsx
 * function FileUploadComponent() {
 *   const { uploadFiles, uploading, progress, error, cancelUpload } =
 *     useFileUploadWithProgress()
 *
 *   const handleUpload = async (files: File[]) => {
 *     try {
 *       const response = await uploadFiles(files)
 *       console.log('Uploaded file IDs:', response.file_ids)
 *     } catch (err) {
 *       console.error('Upload failed:', err)
 *     }
 *   }
 *
 *   return (
 *     <div>
 *       {progress.map((p, i) => (
 *         <div key={i}>
 *           {p.fileName}: {p.percentage}%
 *         </div>
 *       ))}
 *       {uploading && <button onClick={cancelUpload}>Cancel</button>}
 *     </div>
 *   )
 * }
 * ```
 *
 * @returns Hook result with upload function, state, and controls
 */
export function useFileUploadWithProgress(): UseFileUploadWithProgressResult {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<FileProgress[]>([])
  const [error, setError] = useState<FileUploadError | null>(null)
  const xhrRef = useRef<XMLHttpRequest | null>(null)

  /**
   * Upload files with progress tracking via XMLHttpRequest.
   * Progress events are emitted via the `progress` state.
   *
   * @param files - Array of File objects to upload
   * @returns Promise resolving to FileUploadResponse with file_ids
   * @throws FileUploadError if upload fails
   */
  const uploadFiles = useCallback(async (files: File[]): Promise<FileUploadResponse> => {
    setUploading(true)
    setError(null)

    // Initialize progress for each file
    setProgress(
      files.map((file) => ({
        fileName: file.name,
        loaded: 0,
        total: file.size,
        percentage: 0,
      }))
    )

    return new Promise((resolve, reject) => {
      const formData = new FormData()
      files.forEach((file) => formData.append('files', file))

      const xhr = new XMLHttpRequest()
      xhrRef.current = xhr

      xhr.upload.addEventListener('progress', createProgressHandler(setProgress, files.length))
      xhr.addEventListener('load', () => handleXhrLoad(xhr, xhrRef, setUploading, setError, resolve, reject))
      xhr.addEventListener('error', () => {
        setUploading(false)
        xhrRef.current = null
        reportUploadError(setError, reject, createUploadError('network_error', 'Network error during upload'))
      })
      xhr.addEventListener('abort', () => {
        setUploading(false)
        xhrRef.current = null
        reportUploadError(setError, reject, createUploadError('upload_cancelled', 'Upload was cancelled by user'))
      })

      // Send the request
      xhr.open('POST', '/api/v1/files')
      xhr.setRequestHeader('Accept', 'application/json')
      // Note: Don't set Content-Type - browser will set it with boundary for multipart/form-data
      xhr.send(formData)
    })
  }, [])

  /**
   * Cancel the current upload in progress.
   * This will trigger the abort event and reject the upload promise.
   */
  const cancelUpload = useCallback(() => {
    if (xhrRef.current) {
      xhrRef.current.abort()
    }
  }, [])

  /**
   * Reset all hook state to initial values.
   * Useful for clearing errors and progress after a completed upload.
   */
  const reset = useCallback(() => {
    setUploading(false)
    setProgress([])
    setError(null)
    xhrRef.current = null
  }, [])

  return {
    uploadFiles,
    uploading,
    progress,
    error,
    cancelUpload,
    reset,
  }
}
