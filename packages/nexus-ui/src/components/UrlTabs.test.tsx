import { Tab } from '@patternfly/react-core'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { UrlTabs } from './UrlTabs'

const { mockSetLocation, mockGetLocation } = vi.hoisted(() => ({
  mockSetLocation: vi.fn(),
  mockGetLocation: vi.fn().mockReturnValue('/base/tab-a'),
}))

vi.mock('wouter', () => ({
  useLocation: (): [string, typeof mockSetLocation] => [mockGetLocation() as string, mockSetLocation],
}))

describe('UrlTabs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetLocation.mockReturnValue('/base/tab-a')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <UrlTabs basePath="/base" defaultTab="tab-a" aria-label="Test tabs">
        <Tab eventKey="tab-a" title="Tab A">
          Content A
        </Tab>
        <Tab eventKey="tab-b" title="Tab B">
          Content B
        </Tab>
      </UrlTabs>
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('sets active tab from URL path segment', () => {
    render(
      <UrlTabs basePath="/base" aria-label="Test tabs">
        <Tab eventKey="tab-a" title="Tab A">
          Content A
        </Tab>
        <Tab eventKey="tab-b" title="Tab B">
          Content B
        </Tab>
      </UrlTabs>
    )

    expect(screen.getByRole('tab', { name: 'Tab A' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Tab B' })).toHaveAttribute('aria-selected', 'false')
  })

  it('navigates to the correct URL when a tab is clicked', async () => {
    const user = userEvent.setup()
    render(
      <UrlTabs basePath="/base" aria-label="Test tabs">
        <Tab eventKey="tab-a" title="Tab A">
          Content A
        </Tab>
        <Tab eventKey="tab-b" title="Tab B">
          Content B
        </Tab>
      </UrlTabs>
    )

    await user.click(screen.getByRole('tab', { name: 'Tab B' }))

    expect(mockSetLocation).toHaveBeenCalledWith('/base/tab-b')
  })

  it('uses defaultTab when URL has no tab segment', () => {
    mockGetLocation.mockReturnValue('/base')
    render(
      <UrlTabs basePath="/base" defaultTab="tab-b" aria-label="Test tabs">
        <Tab eventKey="tab-a" title="Tab A">
          Content A
        </Tab>
        <Tab eventKey="tab-b" title="Tab B">
          Content B
        </Tab>
      </UrlTabs>
    )

    expect(screen.getByRole('tab', { name: 'Tab B' })).toHaveAttribute('aria-selected', 'true')
  })

  it('redirects to defaultTab when URL tab is not in validTabs', () => {
    mockGetLocation.mockReturnValue('/base/invalid')
    render(
      <UrlTabs basePath="/base" defaultTab="tab-a" validTabs={['tab-a', 'tab-b']} aria-label="Test tabs">
        <Tab eventKey="tab-a" title="Tab A">
          Content A
        </Tab>
        <Tab eventKey="tab-b" title="Tab B">
          Content B
        </Tab>
      </UrlTabs>
    )

    expect(mockSetLocation).toHaveBeenCalledWith('/base/tab-a', { replace: true })
  })

  it('does not redirect when URL tab is valid', () => {
    render(
      <UrlTabs basePath="/base" defaultTab="tab-a" validTabs={['tab-a', 'tab-b']} aria-label="Test tabs">
        <Tab eventKey="tab-a" title="Tab A">
          Content A
        </Tab>
        <Tab eventKey="tab-b" title="Tab B">
          Content B
        </Tab>
      </UrlTabs>
    )

    expect(mockSetLocation).not.toHaveBeenCalled()
  })

  it('redirects to first validTab when no defaultTab is provided', () => {
    mockGetLocation.mockReturnValue('/base')
    render(
      <UrlTabs basePath="/base" validTabs={['first', 'second']} aria-label="Test tabs">
        <Tab eventKey="first" title="First">
          Content
        </Tab>
        <Tab eventKey="second" title="Second">
          Content
        </Tab>
      </UrlTabs>
    )

    expect(mockSetLocation).toHaveBeenCalledWith('/base/first', { replace: true })
  })

  it('passes through additional Tabs props', () => {
    render(
      <UrlTabs basePath="/base" defaultTab="tab-a" aria-label="Custom label" isBox>
        <Tab eventKey="tab-a" title="Tab A">
          Content A
        </Tab>
      </UrlTabs>
    )

    expect(screen.getByRole('tab', { name: 'Tab A' })).toBeInTheDocument()
  })
})
