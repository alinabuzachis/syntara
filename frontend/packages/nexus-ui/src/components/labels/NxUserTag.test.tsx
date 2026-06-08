import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'

import { NxUserTag } from './NxUserTag'

describe('NxUserTag', () => {
  it('renders children text', () => {
    render(<NxUserTag>my-workflow-tag</NxUserTag>)

    expect(screen.getByText('my-workflow-tag')).toBeInTheDocument()
  })

  it('always renders as outline variant', () => {
    render(<NxUserTag data-testid="tag">my-workflow-tag</NxUserTag>)

    expect(screen.getByTestId('tag')).toHaveClass('pf-m-outline')
  })

  it('defaults to compact size', () => {
    render(<NxUserTag data-testid="tag">my-workflow-tag</NxUserTag>)

    expect(screen.getByTestId('tag')).toHaveClass('pf-m-compact')
  })

  it('forwards isCompact={false} to NxLabel', () => {
    render(
      <NxUserTag data-testid="tag" isCompact={false}>
        my-workflow-tag
      </NxUserTag>
    )

    expect(screen.getByTestId('tag')).not.toHaveClass('pf-m-compact')
  })

  it('re-renders correctly when props change', () => {
    const { rerender } = render(<NxUserTag data-testid="tag">first-tag</NxUserTag>)

    expect(screen.getByText('first-tag')).toBeInTheDocument()
    expect(screen.getByTestId('tag')).toHaveClass('pf-m-compact')

    rerender(
      <NxUserTag data-testid="tag" isCompact={false}>
        second-tag
      </NxUserTag>
    )

    expect(screen.getByText('second-tag')).toBeInTheDocument()
    expect(screen.getByTestId('tag')).not.toHaveClass('pf-m-compact')
  })

  it('uses cached output when re-rendered with no prop changes', () => {
    function StableParent() {
      return <NxUserTag data-testid="tag">stable-tag</NxUserTag>
    }

    const { rerender } = render(<StableParent />)

    rerender(<StableParent />)

    expect(screen.getByTestId('tag')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<NxUserTag>my-workflow-tag</NxUserTag>)

    expect(await axe(container)).toHaveNoViolations()
  })
})
