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

  it('provides community mode by default', () => {
    const { result } = renderHook(useDocLinkContext, { wrapper })

    expect(result.current.mode).toBe('community')
    expect(result.current.version).toBe('2.5')
  })

  it('provides extended mode when VITE_EXTENDED=true', () => {
    vi.stubEnv('VITE_EXTENDED', 'true')

    const { result } = renderHook(useDocLinkContext, { wrapper })

    expect(result.current.mode).toBe('extended')
    expect(result.current.version).toBe('2.5')

    vi.unstubAllEnvs()
  })

  it('stays community when VITE_EXTENDED is not true/1', () => {
    vi.stubEnv('VITE_EXTENDED', 'yes')

    const { result } = renderHook(useDocLinkContext, { wrapper })

    expect(result.current.mode).toBe('community')

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
