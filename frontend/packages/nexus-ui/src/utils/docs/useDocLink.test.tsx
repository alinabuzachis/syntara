import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { DocLinkProvider } from './DocLinkProvider'
import docsUrls from './docsUrls.json' with { type: 'json' }
import type { DocKey } from './types'
import { useDocLink } from './useDocLink'

function wrapper({ children }: Readonly<{ children: ReactNode }>) {
  return <DocLinkProvider>{children}</DocLinkProvider>
}

const allDocKeys = Object.keys(docsUrls) as DocKey[]

describe('useDocLink', () => {
  it('returns upstream URL by default', () => {
    const { result } = renderHook(() => useDocLink('workflows'), { wrapper })

    expect(result.current).toBe('https://docs.ansible.com/TODO_UPSTREAM_PATH/workflows')
  })

  it('returns product URL when VITE_DOC_MODE is product', () => {
    vi.stubEnv('VITE_DOC_MODE', 'product')

    const { result } = renderHook(() => useDocLink('workflows'), { wrapper })

    expect(result.current).toBe(
      'https://docs.redhat.com/en/documentation/TODO_PRODUCT_NAME/1.0/TODO_PRODUCT_PATH/workflows'
    )

    vi.unstubAllEnvs()
  })

  it('substitutes version in product base URL', () => {
    vi.stubEnv('VITE_DOC_MODE', 'product')

    const { result } = renderHook(() => useDocLink('credentials'), { wrapper })

    expect(result.current).toContain('/1.0/')

    vi.unstubAllEnvs()
  })

  it('resolves different keys to different paths', () => {
    const { result: workflows } = renderHook(() => useDocLink('workflows'), { wrapper })
    const { result: credentials } = renderHook(() => useDocLink('credentials'), { wrapper })

    expect(workflows.current).not.toBe(credentials.current)
    expect(workflows.current).toContain('workflows')
    expect(credentials.current).toContain('credentials')
  })

  it('falls back to upstream for unknown VITE_DOC_MODE values', () => {
    vi.stubEnv('VITE_DOC_MODE', 'something-invalid')

    const { result } = renderHook(() => useDocLink('workflows'), { wrapper })

    expect(result.current).toBe('https://docs.ansible.com/TODO_UPSTREAM_PATH/workflows')

    vi.unstubAllEnvs()
  })

  it('uses context defaults when rendered without DocLinkProvider', () => {
    const { result } = renderHook(() => useDocLink('workflows'))

    expect(result.current).toBe('https://docs.ansible.com/TODO_UPSTREAM_PATH/workflows')
  })

  it.each(allDocKeys.filter((k) => k !== 'home'))('resolves key "%s" to a valid URL with subpath', (key) => {
    const { result } = renderHook(() => useDocLink(key), { wrapper })

    expect(result.current).toMatch(/^https:\/\/docs\.ansible\.com\//)
    expect(result.current.length).toBeGreaterThan('https://docs.ansible.com/'.length)
  })

  it('resolves "home" key to the base documentation URL', () => {
    const { result } = renderHook(() => useDocLink('home'), { wrapper })

    expect(result.current).toBe('https://docs.ansible.com/')
  })
})

describe('DocLinkProvider', () => {
  it('defaults to upstream mode and version 1.0', () => {
    vi.stubEnv('VITE_DOC_MODE', 'product')

    const { result: productResult } = renderHook(() => useDocLink('workflows'), { wrapper })

    expect(productResult.current).toContain('/1.0/')
    expect(productResult.current).toContain('docs.redhat.com')

    vi.unstubAllEnvs()

    const { result: upstreamResult } = renderHook(() => useDocLink('workflows'), { wrapper })

    expect(upstreamResult.current).toContain('docs.ansible.com')
    expect(upstreamResult.current).not.toContain('docs.redhat.com')
  })
})
