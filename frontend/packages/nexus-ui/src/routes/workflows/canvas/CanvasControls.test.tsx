import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReactFlowProvider } from '@xyflow/react'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

vi.mock('../../../assets/ansible-automation-platform.svg?react', () => ({
  default: () => <span data-testid="mock-aap-icon" />,
}))

import { CanvasControls } from './CanvasControls'

function renderWithFlow(ui: ReactElement) {
  return render(<ReactFlowProvider>{ui}</ReactFlowProvider>)
}

describe('CanvasControls', () => {
  it('toggles the node legend from the toolbar', async () => {
    const user = userEvent.setup()
    renderWithFlow(<CanvasControls onLayout={() => undefined} />)

    expect(screen.queryByTestId('canvas-legend')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show node legend' }))
    expect(screen.getByRole('dialog', { name: 'Legend' })).toBeInTheDocument()
    expect(screen.getByTestId('canvas-legend')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Close legend' })).toHaveFocus()
    })

    await user.click(screen.getByRole('button', { name: 'Hide node legend' }))
    await waitFor(() => {
      expect(screen.queryByTestId('canvas-legend')).not.toBeInTheDocument()
    })
  })

  it('closes the legend when the panel close control is used', async () => {
    const user = userEvent.setup()
    renderWithFlow(<CanvasControls onLayout={() => undefined} />)

    await user.click(screen.getByRole('button', { name: 'Show node legend' }))
    await user.click(screen.getByRole('button', { name: 'Close legend' }))

    await waitFor(() => {
      expect(screen.queryByTestId('canvas-legend')).not.toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Show node legend' })).toHaveFocus()
    })
  })

  it('hides collapse, expand, and layout controls when hideLayout is set (e.g. execution view)', () => {
    renderWithFlow(<CanvasControls onLayout={() => undefined} hideLayout />)

    expect(screen.queryByRole('button', { name: 'Collapse all' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Expand all' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Layout' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show node legend' })).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = renderWithFlow(<CanvasControls onLayout={() => undefined} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
