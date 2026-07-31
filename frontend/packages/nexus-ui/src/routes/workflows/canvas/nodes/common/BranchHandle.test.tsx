import { render, screen, within } from '@testing-library/react'
import { useEdges } from '@xyflow/react'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { BranchHandle, BranchHandles } from './BranchHandle'

// Mock @xyflow/react Handle component
vi.mock('@xyflow/react', () => ({
  Handle: ({
    type,
    id,
    position,
    isConnectable,
    style,
    'aria-label': ariaLabel,
  }: {
    type: string
    id: string
    position: string
    isConnectable?: boolean
    style?: React.CSSProperties
    'aria-label'?: string
  }) => (
    <button
      data-testid={`handle-${id}`}
      data-type={type}
      data-position={position}
      data-connectable={isConnectable}
      style={style}
      aria-label={ariaLabel}
    />
  ),
  Position: {
    Top: 'top',
    Bottom: 'bottom',
    Left: 'left',
    Right: 'right',
  },
  useEdges: vi.fn(() => []),
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
    render(
      <BranchHandles>
        <div>Content</div>
      </BranchHandles>
    )

    const flexContainer = screen.getByTestId('branch-handles')
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

  describe('taken branch indicator', () => {
    it('shows checkmark icon when branch is taken', () => {
      vi.mocked(useEdges).mockReturnValue([
        { id: 'e1', source: 'node-1', sourceHandle: 'true', target: 'node-2', data: { executionStatus: 'passed' } },
      ])
      render(
        <BranchHandle id="true" nodeId="node-1" ariaLabel="True branch output">
          True
        </BranchHandle>
      )

      const handle = screen.getByTestId('branch-handle-true')
      const icon = within(handle).queryByRole('img', { hidden: true })
      expect(icon).toBeInTheDocument()
    })

    it('does not show checkmark when branch is not taken', () => {
      vi.mocked(useEdges).mockReturnValue([
        { id: 'e1', source: 'node-1', sourceHandle: 'false', target: 'node-2', data: { executionStatus: 'passed' } },
      ])
      render(
        <BranchHandle id="true" nodeId="node-1" ariaLabel="True branch output">
          True
        </BranchHandle>
      )

      const handle = screen.getByTestId('branch-handle-true')
      const icon = within(handle).queryByRole('img', { hidden: true })
      expect(icon).not.toBeInTheDocument()
    })

    it('appends path taken to aria-label on handle when taken', () => {
      vi.mocked(useEdges).mockReturnValue([
        { id: 'e1', source: 'node-1', sourceHandle: 'true', target: 'node-2', data: { executionStatus: 'passed' } },
      ])
      render(
        <BranchHandle id="true" nodeId="node-1" ariaLabel="True branch output">
          True
        </BranchHandle>
      )

      expect(screen.getByTestId('handle-true')).toHaveAttribute('aria-label', 'True branch output — path taken')
    })

    it('does not append path taken to aria-label when not taken', () => {
      vi.mocked(useEdges).mockReturnValue([])
      render(
        <BranchHandle id="true" nodeId="node-1" ariaLabel="True branch output">
          True
        </BranchHandle>
      )

      expect(screen.getByTestId('handle-true')).toHaveAttribute('aria-label', 'True branch output')
    })

    it('applies taken class when branch is taken', () => {
      vi.mocked(useEdges).mockReturnValue([
        { id: 'e1', source: 'node-1', sourceHandle: 'true', target: 'node-2', data: { executionStatus: 'passed' } },
      ])
      render(
        <BranchHandle id="true" nodeId="node-1">
          True
        </BranchHandle>
      )

      const handle = screen.getByTestId('branch-handle-true')
      expect(handle.className).toContain('branchHandleTaken')
    })
  })

  describe('badge', () => {
    it('renders badge when provided', () => {
      render(
        <BranchHandle id="loop" badge={<span data-testid="iteration-badge">3</span>}>
          Loop
        </BranchHandle>
      )

      expect(screen.getByTestId('iteration-badge')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
    })

    it('does not render badge when undefined', () => {
      render(<BranchHandle id="loop">Loop</BranchHandle>)

      expect(screen.queryByTestId('iteration-badge')).not.toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('has no accessibility violations', async () => {
      const { container } = render(
        <BranchHandle id="test" ariaLabel="Test branch output">
          Test Label
        </BranchHandle>
      )
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has no accessibility violations with badge', async () => {
      const { container } = render(
        <BranchHandle id="loop" ariaLabel="Loop branch output" badge={<span>3</span>}>
          Loop
        </BranchHandle>
      )
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has no accessibility violations when taken', async () => {
      vi.mocked(useEdges).mockReturnValue([
        { id: 'e1', source: 'node-1', sourceHandle: 'test', target: 'node-2', data: { executionStatus: 'passed' } },
      ])
      const { container } = render(
        <BranchHandle id="test" nodeId="node-1" ariaLabel="Test branch output">
          Test
        </BranchHandle>
      )
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })
  })
})
