import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import type { BrandConfig } from './brandConfig'
import { BrandProvider } from './BrandProvider'
import { useBrand } from './useBrand'

function BrandConsumer() {
  const brand = useBrand()
  return <span data-testid="app-title">{brand.appTitle}</span>
}

describe('BrandProvider', () => {
  it('provides the default brand config', () => {
    render(
      <BrandProvider>
        <BrandConsumer />
      </BrandProvider>
    )
    expect(screen.getByTestId('app-title')).toHaveTextContent('Syntara')
  })

  it('accepts a custom config override', () => {
    const customConfig: BrandConfig = {
      appTitle: 'Custom Product',
      faviconPath: '/custom-favicon.svg',
      logoExpandedLight: '/custom-logo-light.svg',
      logoExpandedDark: '/custom-logo-dark.svg',
      logoCollapsed: '/custom-icon.svg',
      logoLogin: '/custom-login.svg',
    }
    render(
      <BrandProvider config={customConfig}>
        <BrandConsumer />
      </BrandProvider>
    )
    expect(screen.getByTestId('app-title')).toHaveTextContent('Custom Product')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <BrandProvider>
        <BrandConsumer />
      </BrandProvider>
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  describe('favicon sync', () => {
    let faviconLink: HTMLLinkElement

    beforeEach(() => {
      faviconLink = document.createElement('link')
      faviconLink.rel = 'icon'
      faviconLink.href = '/old-favicon.svg'
      document.head.appendChild(faviconLink)
    })

    afterEach(() => {
      faviconLink.remove()
    })

    it('updates the favicon link href from default config', () => {
      render(
        <BrandProvider>
          <BrandConsumer />
        </BrandProvider>
      )
      expect(faviconLink.href).toContain('syntara-icon')
    })

    it('updates the favicon link href from custom config', () => {
      const customConfig: BrandConfig = {
        appTitle: 'Custom',
        faviconPath: '/custom-favicon.svg',
        logoExpandedLight: '/logo-light.svg',
        logoExpandedDark: '/logo-dark.svg',
        logoCollapsed: '/icon.svg',
        logoLogin: '/login.svg',
      }
      render(
        <BrandProvider config={customConfig}>
          <BrandConsumer />
        </BrandProvider>
      )
      expect(faviconLink.href).toContain('/custom-favicon.svg')
    })
  })
})
