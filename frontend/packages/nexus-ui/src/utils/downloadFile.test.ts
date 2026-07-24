import { beforeEach, describe, expect, it, vi } from 'vitest'

import { filesFetchClient } from '../client'

import { downloadFileById } from './downloadFile'

vi.mock('../client', () => ({
  filesFetchClient: {
    GET: vi.fn(),
  },
}))

describe('downloadFileById', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  it('downloads using Content-Disposition filename when present', async () => {
    const click = vi.fn()
    const remove = vi.fn()
    const appendChild = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node)
    vi.spyOn(document, 'createElement').mockImplementation(() => {
      return { click, remove, href: '', download: '' } as unknown as HTMLAnchorElement
    })

    vi.mocked(filesFetchClient.GET).mockResolvedValue({
      data: new Blob(['file-bytes']),
      error: undefined,
      response: new Response(null, {
        headers: { 'content-disposition': 'attachment; filename="Report_Q2.pdf"' },
      }),
    } as never)

    const filename = await downloadFileById('file-1', 'fallback.pdf')

    expect(filename).toBe('Report_Q2.pdf')
    expect(filesFetchClient.GET).toHaveBeenCalledWith('/files/{file_id}/download', {
      params: { path: { file_id: 'file-1' } },
      parseAs: 'blob',
      signal: undefined,
    })
    expect(click).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledTimes(1)
    expect(appendChild).toHaveBeenCalled()
  })

  it('forwards an AbortSignal to the fetch client', async () => {
    vi.spyOn(document, 'createElement').mockImplementation(() => {
      return { click: vi.fn(), remove: vi.fn(), href: '', download: '' } as unknown as HTMLAnchorElement
    })
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node)

    vi.mocked(filesFetchClient.GET).mockResolvedValue({
      data: new Blob(['file-bytes']),
      error: undefined,
      response: new Response(null),
    } as never)

    const controller = new AbortController()
    await downloadFileById('file-1', 'fallback.pdf', controller.signal)

    expect(filesFetchClient.GET).toHaveBeenCalledWith('/files/{file_id}/download', {
      params: { path: { file_id: 'file-1' } },
      parseAs: 'blob',
      signal: controller.signal,
    })
  })

  it('propagates AbortError when the request is aborted', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError')
    vi.mocked(filesFetchClient.GET).mockRejectedValue(abortError)

    const controller = new AbortController()
    controller.abort()

    await expect(downloadFileById('file-1', 'fallback.pdf', controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
  })

  it('falls back to provided filename when Content-Disposition is missing', async () => {
    vi.spyOn(document, 'createElement').mockImplementation(() => {
      return { click: vi.fn(), remove: vi.fn(), href: '', download: '' } as unknown as HTMLAnchorElement
    })
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node)

    vi.mocked(filesFetchClient.GET).mockResolvedValue({
      data: new Blob(['file-bytes']),
      error: undefined,
      response: new Response(null),
    } as never)

    const filename = await downloadFileById('file-1', 'local-name.txt')
    expect(filename).toBe('local-name.txt')
  })

  it('parses unquoted Content-Disposition filenames', async () => {
    vi.spyOn(document, 'createElement').mockImplementation(() => {
      return { click: vi.fn(), remove: vi.fn(), href: '', download: '' } as unknown as HTMLAnchorElement
    })
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node)

    vi.mocked(filesFetchClient.GET).mockResolvedValue({
      data: new Blob(['file-bytes']),
      error: undefined,
      response: new Response(null, {
        headers: { 'content-disposition': 'attachment; filename=plain-name.md' },
      }),
    } as never)

    await expect(downloadFileById('file-1', 'fallback.md')).resolves.toBe('plain-name.md')
  })

  it('throws when the API returns an error', async () => {
    vi.mocked(filesFetchClient.GET).mockResolvedValue({
      data: undefined,
      error: { detail: 'not found' },
      response: new Response(null, { status: 404 }),
    } as never)

    await expect(downloadFileById('missing', 'x.pdf')).rejects.toThrow('Failed to download file')
  })

  it('throws when the API returns no data blob', async () => {
    vi.mocked(filesFetchClient.GET).mockResolvedValue({
      data: undefined,
      error: undefined,
      response: new Response(null, { status: 200 }),
    } as never)

    await expect(downloadFileById('empty', 'x.pdf')).rejects.toThrow('Failed to download file')
  })
})
