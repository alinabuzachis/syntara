import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { detachPromise } from '../utils/detachPromise'

import { useFileUploadWithProgress, createUploadError, isFileUploadError } from './useFileUploadWithProgress'

// Store instances for test access
let mockXhrInstances: MockXMLHttpRequest[] = []

// Mock XMLHttpRequest as a proper class
class MockXMLHttpRequest {
  static DONE = 4
  static OPENED = 1
  static CONNECTING = 0
  static HEADERS_RECEIVED = 2
  static LOADING = 3

  readyState = 0
  status = 0
  responseText = ''

  upload: {
    addEventListener: ReturnType<typeof vi.fn>
    removeEventListener: ReturnType<typeof vi.fn>
  }

  open: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
  abort: ReturnType<typeof vi.fn>
  setRequestHeader: ReturnType<typeof vi.fn>

  private listeners: Record<string, ((event: unknown) => void)[]> = {}

  constructor() {
    this.upload = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    this.open = vi.fn()
    this.send = vi.fn()
    this.abort = vi.fn()
    this.setRequestHeader = vi.fn()
    mockXhrInstances.push(this)
  }

  addEventListener(event: string, handler: (event: unknown) => void) {
    if (!this.listeners[event]) {
      this.listeners[event] = []
    }
    this.listeners[event].push(handler)
  }

  removeEventListener(event: string, handler: (event: unknown) => void) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter((h) => h !== handler)
    }
  }

  // Test helper methods
  simulateLoad(status: number, response: unknown) {
    this.status = status
    this.responseText = JSON.stringify(response)
    this.listeners['load']?.forEach((h) => h({}))
  }

  simulateError() {
    this.listeners['error']?.forEach((h) => h({}))
  }

  simulateAbort() {
    this.listeners['abort']?.forEach((h) => h({}))
  }

  simulateProgress(loaded: number, total: number) {
    const calls = this.upload.addEventListener.mock.calls as [string, (e: unknown) => void][]
    calls
      .filter(([event]) => event === 'progress')
      .forEach(([, handler]) => {
        handler({ lengthComputable: true, loaded, total })
      })
  }

  simulateLoadRaw(status: number, responseText: string) {
    this.status = status
    this.responseText = responseText
    this.listeners['load']?.forEach((h) => h({}))
  }
}

describe('createUploadError', () => {
  it('returns correct error format with error and message properties', () => {
    const result = createUploadError('validation_error', 'Invalid input')

    expect(result).toHaveProperty('error')
    expect(result).toHaveProperty('message')
    expect(Object.keys(result)).toEqual(['error', 'message'])
  })

  it('preserves error code correctly', () => {
    expect(createUploadError('parse_error', 'msg').error).toBe('parse_error')
    expect(createUploadError('network_error', 'msg').error).toBe('network_error')
    expect(createUploadError('upload_cancelled', 'msg').error).toBe('upload_cancelled')
    expect(createUploadError('upload_failed', 'msg').error).toBe('upload_failed')
  })

  it('preserves message correctly', () => {
    const msg = 'Failed to parse server response'
    expect(createUploadError('parse_error', msg).message).toBe(msg)

    const customMsg = 'Custom error message'
    expect(createUploadError('custom_code', customMsg).message).toBe(customMsg)
  })
})

describe('useFileUploadWithProgress', () => {
  beforeEach(() => {
    mockXhrInstances = []
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const getLastXhr = () => mockXhrInstances[mockXhrInstances.length - 1]

  it('initializes with default state', () => {
    const { result } = renderHook(() => useFileUploadWithProgress())

    expect(result.current.uploading).toBe(false)
    expect(result.current.progress).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('sets uploading to true when upload starts', () => {
    const { result } = renderHook(() => useFileUploadWithProgress())
    const file = new File(['content'], 'test.txt', { type: 'text/plain' })

    act(() => {
      detachPromise(result.current.uploadFiles([file]))
    })

    expect(result.current.uploading).toBe(true)
  })

  it('initializes progress for each file', () => {
    const { result } = renderHook(() => useFileUploadWithProgress())
    const file1 = new File(['content1'], 'file1.txt', { type: 'text/plain' })
    const file2 = new File(['content2'], 'file2.txt', { type: 'text/plain' })

    act(() => {
      detachPromise(result.current.uploadFiles([file1, file2]))
    })

    expect(result.current.progress).toHaveLength(2)
    expect(result.current.progress[0].fileName).toBe('file1.txt')
    expect(result.current.progress[1].fileName).toBe('file2.txt')
  })

  it('sends POST request to correct endpoint', () => {
    const { result } = renderHook(() => useFileUploadWithProgress())
    const file = new File(['content'], 'test.txt', { type: 'text/plain' })

    act(() => {
      detachPromise(result.current.uploadFiles([file]))
    })

    const xhr = getLastXhr()
    expect(xhr.open).toHaveBeenCalledWith('POST', '/api/v1/files')
    expect(xhr.setRequestHeader).toHaveBeenCalledWith('Accept', 'application/json')
    expect(xhr.send).toHaveBeenCalled()
  })

  it('resolves with response on successful upload', async () => {
    const { result } = renderHook(() => useFileUploadWithProgress())
    const file = new File(['content'], 'test.txt', { type: 'text/plain' })
    const expectedResponse = { file_ids: ['abc123'] }

    let uploadPromise: Promise<unknown>
    act(() => {
      uploadPromise = result.current.uploadFiles([file])
    })

    const xhr = getLastXhr()
    act(() => {
      xhr.simulateLoad(200, expectedResponse)
    })

    await waitFor(async () => {
      const response = await uploadPromise
      expect(response).toEqual(expectedResponse)
    })

    expect(result.current.uploading).toBe(false)
  })

  it('sets error on failed upload', async () => {
    const { result } = renderHook(() => useFileUploadWithProgress())
    const file = new File(['content'], 'test.txt', { type: 'text/plain' })
    const errorResponse = { error: 'upload_failed', message: 'File too large' }

    let uploadPromise: Promise<unknown>
    act(() => {
      uploadPromise = result.current.uploadFiles([file])
    })

    const xhr = getLastXhr()
    act(() => {
      xhr.simulateLoad(400, errorResponse)
    })

    // Catch the expected rejection
    await expect(uploadPromise!).rejects.toEqual(errorResponse)

    expect(result.current.error).toEqual(errorResponse)
    expect(result.current.uploading).toBe(false)
  })

  it('sets error on network error', async () => {
    const { result } = renderHook(() => useFileUploadWithProgress())
    const file = new File(['content'], 'test.txt', { type: 'text/plain' })
    const expectedError = {
      error: 'network_error',
      message: 'Network error during upload',
    }

    let uploadPromise: Promise<unknown>
    act(() => {
      uploadPromise = result.current.uploadFiles([file])
    })

    const xhr = getLastXhr()
    act(() => {
      xhr.simulateError()
    })

    // Catch the expected rejection
    await expect(uploadPromise!).rejects.toEqual(expectedError)

    expect(result.current.error).toEqual(expectedError)
    expect(result.current.uploading).toBe(false)
  })

  it('sets error on parse error', async () => {
    const { result } = renderHook(() => useFileUploadWithProgress())
    const file = new File(['content'], 'test.txt', { type: 'text/plain' })
    const expectedError = {
      error: 'parse_error',
      message: 'Failed to parse server response',
    }

    let uploadPromise: Promise<unknown>
    act(() => {
      uploadPromise = result.current.uploadFiles([file])
    })

    const xhr = getLastXhr()
    act(() => {
      xhr.simulateLoadRaw(200, 'invalid json')
    })

    // Catch the expected rejection
    await expect(uploadPromise!).rejects.toEqual(expectedError)

    expect(result.current.error).toEqual(expectedError)
  })

  it('cancelUpload aborts the request', () => {
    const { result } = renderHook(() => useFileUploadWithProgress())
    const file = new File(['content'], 'test.txt', { type: 'text/plain' })

    act(() => {
      detachPromise(result.current.uploadFiles([file]))
    })

    const xhr = getLastXhr()
    act(() => {
      result.current.cancelUpload()
    })

    expect(xhr.abort).toHaveBeenCalled()
  })

  it('sets error on cancel/abort', async () => {
    const { result } = renderHook(() => useFileUploadWithProgress())
    const file = new File(['content'], 'test.txt', { type: 'text/plain' })
    const expectedError = {
      error: 'upload_cancelled',
      message: 'Upload was cancelled by user',
    }

    let uploadPromise: Promise<unknown>
    act(() => {
      uploadPromise = result.current.uploadFiles([file])
    })

    const xhr = getLastXhr()
    act(() => {
      xhr.simulateAbort()
    })

    // Catch the expected rejection
    await expect(uploadPromise!).rejects.toEqual(expectedError)

    expect(result.current.error).toEqual(expectedError)
    expect(result.current.uploading).toBe(false)
  })

  it('reset clears all state', async () => {
    const { result } = renderHook(() => useFileUploadWithProgress())
    const file = new File(['content'], 'test.txt', { type: 'text/plain' })
    const expectedError = {
      error: 'network_error',
      message: 'Network error during upload',
    }

    let uploadPromise: Promise<unknown>
    act(() => {
      uploadPromise = result.current.uploadFiles([file])
    })

    const xhr = getLastXhr()
    act(() => {
      xhr.simulateError()
    })

    // Catch the expected rejection
    await expect(uploadPromise!).rejects.toEqual(expectedError)

    expect(result.current.error).not.toBeNull()

    act(() => {
      result.current.reset()
    })

    expect(result.current.uploading).toBe(false)
    expect(result.current.progress).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('updates progress during upload', async () => {
    const { result } = renderHook(() => useFileUploadWithProgress())
    const file = new File(['content'], 'test.txt', { type: 'text/plain' })

    act(() => {
      detachPromise(result.current.uploadFiles([file]))
    })

    const xhr = getLastXhr()
    act(() => {
      xhr.simulateProgress(50, 100)
    })

    await waitFor(() => {
      expect(result.current.progress[0].percentage).toBe(50)
    })
  })

  it('preserves each file total during progress updates with uneven sizes', async () => {
    const { result } = renderHook(() => useFileUploadWithProgress())
    const small = new File(['a'.repeat(10)], 'small.txt', { type: 'text/plain' })
    const large = new File(['a'.repeat(100)], 'large.txt', { type: 'text/plain' })

    act(() => {
      detachPromise(result.current.uploadFiles([small, large]))
    })

    const xhr = getLastXhr()
    act(() => {
      xhr.simulateProgress(55, 110)
    })

    await waitFor(() => {
      expect(result.current.progress[0].total).toBe(small.size)
      expect(result.current.progress[1].total).toBe(large.size)
      expect(result.current.progress[0].percentage).toBe(50)
      expect(result.current.progress[1].percentage).toBe(50)
      expect(result.current.progress[0].loaded).toBeLessThanOrEqual(small.size)
      expect(result.current.progress[1].loaded).toBeLessThanOrEqual(large.size)
    })
  })

  it('handles malformed JSON error response (missing required fields)', async () => {
    const { result } = renderHook(() => useFileUploadWithProgress())
    const file = new File(['content'], 'test.txt', { type: 'text/plain' })
    const expectedError = {
      error: 'upload_failed',
      message: 'Upload failed with status 422',
    }

    let uploadPromise: Promise<unknown>
    act(() => {
      uploadPromise = result.current.uploadFiles([file])
    })

    const xhr = getLastXhr()
    act(() => {
      xhr.simulateLoadRaw(422, JSON.stringify({ code: 'INVALID', detail: 'bad request' }))
    })

    await expect(uploadPromise!).rejects.toEqual(expectedError)
    expect(result.current.error).toEqual(expectedError)
  })

  it('handles non-JSON error response', async () => {
    const { result } = renderHook(() => useFileUploadWithProgress())
    const file = new File(['content'], 'test.txt', { type: 'text/plain' })
    const expectedError = {
      error: 'upload_failed',
      message: 'Upload failed with status 500',
    }

    let uploadPromise: Promise<unknown>
    act(() => {
      uploadPromise = result.current.uploadFiles([file])
    })

    const xhr = getLastXhr()
    act(() => {
      xhr.simulateLoadRaw(500, 'Internal Server Error')
    })

    // Catch the expected rejection
    await expect(uploadPromise!).rejects.toEqual(expectedError)

    expect(result.current.error).toEqual(expectedError)
  })
})

describe('isFileUploadError', () => {
  it('returns true for valid FileUploadError objects', () => {
    expect(isFileUploadError({ error: 'upload_failed', message: 'Something went wrong' })).toBe(true)
  })

  it('returns false for null', () => {
    expect(isFileUploadError(null)).toBe(false)
  })

  it('returns false for objects missing required fields', () => {
    expect(isFileUploadError({ code: 'INVALID' })).toBe(false)
    expect(isFileUploadError({ error: 'test' })).toBe(false)
    expect(isFileUploadError({ message: 'test' })).toBe(false)
  })

  it('returns false for non-string fields', () => {
    expect(isFileUploadError({ error: 123, message: 'test' })).toBe(false)
    expect(isFileUploadError({ error: 'test', message: 456 })).toBe(false)
  })

  it('returns false for primitives', () => {
    expect(isFileUploadError('string')).toBe(false)
    expect(isFileUploadError(42)).toBe(false)
    expect(isFileUploadError(undefined)).toBe(false)
  })
})
