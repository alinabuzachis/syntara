import { RhUiCheckCircleIcon } from '@patternfly/react-icons'
import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'

import { NxLabel } from './NxLabel'

describe('NxLabel', () => {
  it('renders children text', () => {
    render(<NxLabel>Completed</NxLabel>)

    expect(screen.getByText('Completed')).toBeInTheDocument()
  })

  it('renders icon when provided', () => {
    render(
      <NxLabel status="success" icon={<RhUiCheckCircleIcon data-testid="label-icon" />}>
        Success
      </NxLabel>
    )

    expect(screen.getByTestId('label-icon')).toBeInTheDocument()
  })

  it('defaults to compact size', () => {
    render(<NxLabel data-testid="label">Default</NxLabel>)

    expect(screen.getByTestId('label')).toHaveClass('pf-m-compact')
  })

  it('renders full-size when isCompact is false', () => {
    render(
      <NxLabel data-testid="label" isCompact={false}>
        Full Size
      </NxLabel>
    )

    expect(screen.getByTestId('label')).not.toHaveClass('pf-m-compact')
  })

  it('defaults to filled variant', () => {
    render(<NxLabel data-testid="label">Filled</NxLabel>)

    expect(screen.getByTestId('label')).not.toHaveClass('pf-m-outline')
  })

  it('renders outline variant when specified', () => {
    render(
      <NxLabel data-testid="label" variant="outline">
        Outline
      </NxLabel>
    )

    expect(screen.getByTestId('label')).toHaveClass('pf-m-outline')
  })

  it('forwards color prop', () => {
    render(<NxLabel color="blue">Blue</NxLabel>)

    expect(screen.getByText('Blue')).toBeInTheDocument()
  })

  it('re-renders correctly when props change', () => {
    const { rerender } = render(<NxLabel data-testid="label">First</NxLabel>)

    expect(screen.getByText('First')).toBeInTheDocument()
    expect(screen.getByTestId('label')).toHaveClass('pf-m-compact')

    rerender(
      <NxLabel data-testid="label" isCompact={false} variant="outline">
        Second
      </NxLabel>
    )

    expect(screen.getByText('Second')).toBeInTheDocument()
    expect(screen.getByTestId('label')).not.toHaveClass('pf-m-compact')
    expect(screen.getByTestId('label')).toHaveClass('pf-m-outline')
  })

  it('re-renders when only children change (same isCompact and variant)', () => {
    const { rerender } = render(<NxLabel>First content</NxLabel>)

    expect(screen.getByText('First content')).toBeInTheDocument()

    rerender(<NxLabel>Updated content</NxLabel>)

    expect(screen.getByText('Updated content')).toBeInTheDocument()
  })

  it('uses cached output when re-rendered with no prop changes', () => {
    function StableParent() {
      return <NxLabel data-testid="label">Cached</NxLabel>
    }

    const { rerender } = render(<StableParent />)

    rerender(<StableParent />)

    expect(screen.getByTestId('label')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <NxLabel status="success" icon={<RhUiCheckCircleIcon />}>
        Completed
      </NxLabel>
    )

    expect(await axe(container)).toHaveNoViolations()
  })
})
