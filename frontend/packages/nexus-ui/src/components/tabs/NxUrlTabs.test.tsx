import { Tab } from '@patternfly/react-core'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { NxUrlTabs } from './NxUrlTabs'

const { mockSetLocation, mockGetLocation } = vi.hoisted(() => ({
  mockSetLocation: vi.fn(),
  mockGetLocation: vi.fn().mockReturnValue('/base/tab-a'),
}))

vi.mock('../../hooks/routing/useLocation', () => ({
  useLocation: () => mockGetLocation() as string,
}))
vi.mock('../../hooks/routing/useNavigate', () => ({
  useNavigate: () => mockSetLocation,
}))

describe('NxUrlTabs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetLocation.mockReturnValue('/base/tab-a')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <NxUrlTabs basePath="/base" defaultTab="tab-a" aria-label="Test tabs">
        <Tab eventKey="tab-a" title="Tab A">
          Content A
        </Tab>
        <Tab eventKey="tab-b" title="Tab B">
          Content B
        </Tab>
      </NxUrlTabs>
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('sets active tab from URL path segment', () => {
    render(
      <NxUrlTabs basePath="/base" aria-label="Test tabs">
        <Tab eventKey="tab-a" title="Tab A">
          Content A
        </Tab>
        <Tab eventKey="tab-b" title="Tab B">
          Content B
        </Tab>
      </NxUrlTabs>
    )

    expect(screen.getByRole('tab', { name: 'Tab A' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Tab B' })).toHaveAttribute('aria-selected', 'false')
  })

  it('navigates to the correct URL when a tab is clicked', async () => {
    const user = userEvent.setup()
    render(
      <NxUrlTabs basePath="/base" aria-label="Test tabs">
        <Tab eventKey="tab-a" title="Tab A">
          Content A
        </Tab>
        <Tab eventKey="tab-b" title="Tab B">
          Content B
        </Tab>
      </NxUrlTabs>
    )

    await user.click(screen.getByRole('tab', { name: 'Tab B' }))

    expect(mockSetLocation).toHaveBeenCalledWith('/base/tab-b')
  })

  it('uses defaultTab when URL has no tab segment', () => {
    mockGetLocation.mockReturnValue('/base')
    render(
      <NxUrlTabs basePath="/base" defaultTab="tab-b" aria-label="Test tabs">
        <Tab eventKey="tab-a" title="Tab A">
          Content A
        </Tab>
        <Tab eventKey="tab-b" title="Tab B">
          Content B
        </Tab>
      </NxUrlTabs>
    )

    expect(screen.getByRole('tab', { name: 'Tab B' })).toHaveAttribute('aria-selected', 'true')
  })

  it('redirects to defaultTab when URL tab is not in validTabs', () => {
    mockGetLocation.mockReturnValue('/base/invalid')
    render(
      <NxUrlTabs basePath="/base" defaultTab="tab-a" validTabs={['tab-a', 'tab-b']} aria-label="Test tabs">
        <Tab eventKey="tab-a" title="Tab A">
          Content A
        </Tab>
        <Tab eventKey="tab-b" title="Tab B">
          Content B
        </Tab>
      </NxUrlTabs>
    )

    expect(mockSetLocation).toHaveBeenCalledWith('/base/tab-a', { replace: true })
  })

  it('does not redirect when URL tab is valid', () => {
    render(
      <NxUrlTabs basePath="/base" defaultTab="tab-a" validTabs={['tab-a', 'tab-b']} aria-label="Test tabs">
        <Tab eventKey="tab-a" title="Tab A">
          Content A
        </Tab>
        <Tab eventKey="tab-b" title="Tab B">
          Content B
        </Tab>
      </NxUrlTabs>
    )

    expect(mockSetLocation).not.toHaveBeenCalled()
  })

  it('redirects to first validTab when no defaultTab is provided', () => {
    mockGetLocation.mockReturnValue('/base')
    render(
      <NxUrlTabs basePath="/base" validTabs={['first', 'second']} aria-label="Test tabs">
        <Tab eventKey="first" title="First">
          Content
        </Tab>
        <Tab eventKey="second" title="Second">
          Content
        </Tab>
      </NxUrlTabs>
    )

    expect(mockSetLocation).toHaveBeenCalledWith('/base/first', { replace: true })
  })

  it('passes through additional Tabs props', () => {
    render(
      <NxUrlTabs basePath="/base" defaultTab="tab-a" aria-label="Custom label" isBox>
        <Tab eventKey="tab-a" title="Tab A">
          Content A
        </Tab>
      </NxUrlTabs>
    )

    expect(screen.getByRole('tab', { name: 'Tab A' })).toBeInTheDocument()
  })

  it('blurs focused tab on popstate (browser back/forward)', () => {
    render(
      <NxUrlTabs basePath="/base" aria-label="Test tabs">
        <Tab eventKey="tab-a" title="Tab A">
          Content A
        </Tab>
        <Tab eventKey="tab-b" title="Tab B">
          Content B
        </Tab>
      </NxUrlTabs>
    )

    const tabA = screen.getByRole('tab', { name: 'Tab A' })
    tabA.focus()
    expect(tabA).toHaveFocus()

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(tabA).not.toHaveFocus()
  })
})
