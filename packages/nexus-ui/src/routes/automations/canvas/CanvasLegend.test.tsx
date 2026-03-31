import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

vi.mock('../../../assets/ansible-automation-platform.svg?react', () => ({
  default: () => <span data-testid="mock-aap-icon" />,
}))

import { CanvasLegend } from './CanvasLegend'

describe('CanvasLegend', () => {
  it('renders node type labels and approval branch hints', () => {
    render(<CanvasLegend regionId="legend-region" hide={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByTestId('canvas-legend')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Legend', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Nodes', level: 3 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Connectors', level: 3 })).toBeInTheDocument()
    expect(screen.getByText('AI agent')).toBeInTheDocument()
    expect(screen.getByText('Action')).toBeInTheDocument()
    expect(screen.getByText('AAP execution')).toBeInTheDocument()
    expect(screen.getByText('Logic')).toBeInTheDocument()
    expect(screen.getByText('Approval')).toBeInTheDocument()
    expect(screen.getByText('Trigger')).toBeInTheDocument()
    expect(screen.getByText('Approved')).toBeInTheDocument()
    expect(screen.getByText('Rejected')).toBeInTheDocument()
  })

  it('calls hide and onClose when the header close control is used', async () => {
    const user = userEvent.setup()
    const hide = vi.fn()
    const onClose = vi.fn()
    render(<CanvasLegend regionId="legend-region" hide={hide} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Close legend' }))

    expect(hide).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<CanvasLegend regionId="legend-region" hide={vi.fn()} onClose={vi.fn()} />)

    expect(await axe(container)).toHaveNoViolations()
  })
})
