import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { BranchHandle, BranchHandles } from './BranchHandle'

// Mock @xyflow/react Handle component
vi.mock('@xyflow/react', () => ({
  Handle: ({
    type,
    id,
    position,
    isConnectable,
    style,
  }: {
    type: string
    id: string
    position: string
    isConnectable?: boolean
    style?: React.CSSProperties
  }) => (
    <div
      data-testid={`handle-${id}`}
      data-type={type}
      data-position={position}
      data-connectable={isConnectable}
      style={style}
    />
  ),
  Position: {
    Top: 'top',
    Bottom: 'bottom',
    Left: 'left',
    Right: 'right',
  },
}))

describe('BranchHandles', () => {
  it('renders children in a flex container', () => {
    render(
      <BranchHandles>
        <div data-testid="child-1">Branch 1</div>
        <div data-testid="child-2">Branch 2</div>
      </BranchHandles>
    )

    expect(screen.getByTestId('child-1')).toBeInTheDocument()
    expect(screen.getByTestId('child-2')).toBeInTheDocument()
  })

  it('renders multiple branch handles', () => {
    render(
      <BranchHandles>
        <BranchHandle id="true">True</BranchHandle>
        <BranchHandle id="false">False</BranchHandle>
      </BranchHandles>
    )

    expect(screen.getByText('True')).toBeInTheDocument()
    expect(screen.getByText('False')).toBeInTheDocument()
  })

  it('uses column direction for stacking', () => {
    const { container } = render(
      <BranchHandles>
        <div>Content</div>
      </BranchHandles>
    )

    const flexContainer = container.querySelector('.pf-v6-l-flex')
    expect(flexContainer).toBeInTheDocument()
    expect(flexContainer).toHaveClass('pf-m-column')
  })
})

describe('BranchHandle', () => {
  it('renders children as branch label', () => {
    render(<BranchHandle id="test">Test Label</BranchHandle>)

    expect(screen.getByText('Test Label')).toBeInTheDocument()
  })

  it('renders Handle component with correct id', () => {
    render(<BranchHandle id="branch-1">Branch 1</BranchHandle>)

    const handle = screen.getByTestId('handle-branch-1')
    expect(handle).toBeInTheDocument()
  })

  it('renders Handle as source type', () => {
    render(<BranchHandle id="source-branch">Source</BranchHandle>)

    const handle = screen.getByTestId('handle-source-branch')
    expect(handle).toHaveAttribute('data-type', 'source')
  })

  it('renders Handle on right position', () => {
    render(<BranchHandle id="right-branch">Right</BranchHandle>)

    const handle = screen.getByTestId('handle-right-branch')
    expect(handle).toHaveAttribute('data-position', 'right')
  })

  it('passes isConnectable prop to Handle', () => {
    render(
      <BranchHandle id="connectable" isConnectable={true}>
        Connectable
      </BranchHandle>
    )

    const handle = screen.getByTestId('handle-connectable')
    expect(handle).toHaveAttribute('data-connectable', 'true')
  })

  it('passes isConnectable false when specified', () => {
    render(
      <BranchHandle id="not-connectable" isConnectable={false}>
        Not Connectable
      </BranchHandle>
    )

    const handle = screen.getByTestId('handle-not-connectable')
    expect(handle).toHaveAttribute('data-connectable', 'false')
  })

  describe('styling', () => {
    it('applies border styling', () => {
      const { container } = render(<BranchHandle id="styled">Styled</BranchHandle>)

      const branchDiv = container.firstChild as HTMLElement
      expect(branchDiv).toHaveStyle({
        position: 'relative',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
      })
    })

    it('has rounded left corners', () => {
      const { container } = render(<BranchHandle id="rounded">Rounded</BranchHandle>)

      const branchDiv = container.firstChild as HTMLElement
      expect(branchDiv).toHaveStyle({
        borderTopLeftRadius: '2rem',
        borderBottomLeftRadius: '2rem',
      })
    })

    it('uses flex display for alignment', () => {
      const { container } = render(<BranchHandle id="flex">Flex</BranchHandle>)

      const branchDiv = container.firstChild as HTMLElement
      expect(branchDiv).toHaveStyle({
        display: 'flex',
        alignItems: 'center',
      })
    })
  })

  describe('content variations', () => {
    it('renders "True" label for condition true branch', () => {
      render(<BranchHandle id="true">True</BranchHandle>)
      expect(screen.getByText('True')).toBeInTheDocument()
    })

    it('renders "False" label for condition false branch', () => {
      render(<BranchHandle id="false">False</BranchHandle>)
      expect(screen.getByText('False')).toBeInTheDocument()
    })

    it('renders "Loop" label for loop continue branch', () => {
      render(<BranchHandle id="loop">Loop</BranchHandle>)
      expect(screen.getByText('Loop')).toBeInTheDocument()
    })

    it('renders "Done" label for loop done branch', () => {
      render(<BranchHandle id="done">Done</BranchHandle>)
      expect(screen.getByText('Done')).toBeInTheDocument()
    })

    it('renders "Approved" for approval accept branch', () => {
      render(<BranchHandle id="approved">Approved</BranchHandle>)
      expect(screen.getByText('Approved')).toBeInTheDocument()
    })

    it('renders "Rejected" for approval reject branch', () => {
      render(<BranchHandle id="rejected">Rejected</BranchHandle>)
      expect(screen.getByText('Rejected')).toBeInTheDocument()
    })
  })

  describe('complex children', () => {
    it('renders React elements as children', () => {
      render(
        <BranchHandle id="complex">
          <span data-testid="icon">🔄</span>
          <span>Loop Back</span>
        </BranchHandle>
      )

      expect(screen.getByTestId('icon')).toBeInTheDocument()
      expect(screen.getByText('Loop Back')).toBeInTheDocument()
    })
  })
})
