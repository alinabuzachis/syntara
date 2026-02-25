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

  describe('Run step button', () => {
    it('renders with correct label and triggers info alert on click', async () => {
      const user = userEvent.setup()
      render(<NodeFormTabsLayout parametersContent={<div>Params</div>} />)

      const button = screen.getByRole('button', { name: 'Run step' })
      expect(button).toBeInTheDocument()

      await user.click(button)
      expect(mockShowInfo).toHaveBeenCalledWith('Not yet implemented')
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
