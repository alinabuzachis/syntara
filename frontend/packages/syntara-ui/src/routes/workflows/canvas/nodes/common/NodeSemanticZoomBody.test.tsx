import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { NodeSemanticZoomBody } from './NodeSemanticZoomBody'

describe('NodeSemanticZoomBody', () => {
  it('exposes name and type in aria-label', () => {
    render(
      <NodeSemanticZoomBody
        title="Analyze Data"
        typeLabel="Task Agent"
        backgroundColor="rgb(100, 100, 200)"
        selected={false}
        hasDashedBorder={false}
      />
    )

    const bar = screen.getByRole('group', { name: 'Analyze Data, Task Agent' })
    expect(bar).toBeInTheDocument()
    expect(bar).toHaveAttribute('tabindex', '0')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <NodeSemanticZoomBody
        title="Node A"
        typeLabel="Condition"
        backgroundColor="#ccc"
        selected={false}
        hasDashedBorder={false}
      />
    )

    expect(await axe(container)).toHaveNoViolations()
  })

  it('shows tooltip content on hover', async () => {
    const user = userEvent.setup()
    render(
      <NodeSemanticZoomBody
        title="My Task"
        typeLabel="REST API"
        backgroundColor="#999"
        selected={false}
        hasDashedBorder={false}
      />
    )

    await user.hover(screen.getByRole('group', { name: 'My Task, REST API' }))

    expect(await screen.findByText('My Task')).toBeInTheDocument()
    expect(screen.getByText('REST API')).toBeInTheDocument()
  })
})
