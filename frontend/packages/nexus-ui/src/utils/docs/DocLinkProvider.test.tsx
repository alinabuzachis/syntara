import { render, renderHook } from '@testing-library/react'
import { useContext, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { DocLinkContext } from './docLinkContext'
import { DocLinkProvider } from './DocLinkProvider'

function useDocLinkContext() {
  return useContext(DocLinkContext)
}

describe('DocLinkProvider', () => {
  function wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return <DocLinkProvider>{children}</DocLinkProvider>
  }

  it('provides upstream mode by default', () => {
    const { result } = renderHook(useDocLinkContext, { wrapper })

    expect(result.current.mode).toBe('upstream')
    expect(result.current.version).toBe('1.0')
  })

  it('provides product mode when VITE_APP_MODE is product', () => {
    vi.stubEnv('VITE_APP_MODE', 'product')

    const { result } = renderHook(useDocLinkContext, { wrapper })

    expect(result.current.mode).toBe('product')
    expect(result.current.version).toBe('1.0')

    vi.unstubAllEnvs()
  })

  it('falls back to upstream for unknown VITE_APP_MODE values', () => {
    vi.stubEnv('VITE_APP_MODE', 'invalid-mode')

    const { result } = renderHook(useDocLinkContext, { wrapper })

    expect(result.current.mode).toBe('upstream')

    vi.unstubAllEnvs()
  })

  it('renders children', () => {
    const { container } = render(
      <DocLinkProvider>
        <span>child content</span>
      </DocLinkProvider>
    )

    expect(container).toHaveTextContent('child content')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <DocLinkProvider>
        <p>Accessible content</p>
      </DocLinkProvider>
    )

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
