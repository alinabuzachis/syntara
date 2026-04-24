import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { NodeFormTabsLayout } from './NodeFormTabsLayout'

const mockShowInfo = vi.fn()
vi.mock('../../../../components/alerts', () => ({
  useAlerts: vi.fn(() => ({ showInfo: mockShowInfo })),
}))

describe('NodeFormTabsLayout', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('Test step button', () => {
    it('renders with correct label and falls back to info alert when no onTestStep is provided', async () => {
      const user = userEvent.setup()
      render(<NodeFormTabsLayout parametersContent={<div>Params</div>} />)

      const button = screen.getByRole('button', { name: 'Test step' })
      expect(button).toBeInTheDocument()

      await user.click(button)
      expect(mockShowInfo).toHaveBeenCalledWith('Not yet implemented')
    })

    it('calls onTestStep when provided', async () => {
      const user = userEvent.setup()
      const onTestStep = vi.fn()
      render(<NodeFormTabsLayout parametersContent={<div>Params</div>} onTestStep={onTestStep} />)

      await user.click(screen.getByRole('button', { name: 'Test step' }))

      expect(onTestStep).toHaveBeenCalledTimes(1)
      expect(mockShowInfo).not.toHaveBeenCalled()
    })

    it('shows loading state when isTestStepPending is true', () => {
      render(<NodeFormTabsLayout parametersContent={<div>Params</div>} isTestStepPending />)

      const button = screen.getByRole('button', { name: /running/i })
      expect(button).toBeDisabled()
      expect(screen.getByRole('progressbar')).toBeInTheDocument()
    })
  })

  describe('tab navigation', () => {
    it('shows parameters content by default', () => {
      render(
        <NodeFormTabsLayout
          parametersContent={<div>Parameter content</div>}
          settingsContent={<div>Settings content</div>}
        />
      )

      expect(screen.getByText('Parameter content')).toBeInTheDocument()
      expect(screen.queryByText('Settings content')).not.toBeInTheDocument()
    })

    it('switches to settings content when Settings tab is clicked', async () => {
      const user = userEvent.setup()
      render(
        <NodeFormTabsLayout
          parametersContent={<div>Parameter content</div>}
          settingsContent={<div>Settings content</div>}
        />
      )

      await user.click(screen.getByRole('tab', { name: 'Settings' }))

      expect(screen.getByText('Settings content')).toBeInTheDocument()
      expect(screen.queryByText('Parameter content')).not.toBeInTheDocument()
    })

    it('renders nothing in the Settings tab when settingsContent is not provided', async () => {
      const user = userEvent.setup()
      render(<NodeFormTabsLayout parametersContent={<div>Parameter content</div>} />)

      await user.click(screen.getByRole('tab', { name: 'Settings' }))

      expect(screen.queryByText('Parameter content')).not.toBeInTheDocument()
    })
  })
})
