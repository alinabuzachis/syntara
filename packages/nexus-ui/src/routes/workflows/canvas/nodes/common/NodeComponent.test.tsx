import { render, screen } from '@testing-library/react'
import type { NodeProps } from '@xyflow/react'
import { Position, ReactFlowProvider } from '@xyflow/react'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

const viewportState = vi.hoisted(() => ({ zoom: 1 }))

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>()
  return {
    ...actual,
    useStore: (selector: (s: { transform: [number, number, number] }) => unknown) =>
      selector({ transform: [0, 0, viewportState.zoom] }),
    useUpdateNodeInternals: () => vi.fn(),
  }
})

import { NodeComponent } from './NodeComponent'

function renderWithFlow(ui: ReactElement) {
  return render(<ReactFlowProvider>{ui}</ReactFlowProvider>)
}

describe('NodeComponent semantic zoom', () => {
  afterEach(() => {
    viewportState.zoom = 1
    vi.clearAllMocks()
  })

  const baseNodeProps = {
    id: 'n1',
    data: { id: 'a1', type: 'condition', name: 'C' },
    selected: false,
    type: 'condition',
    dragging: false,
    zIndex: 0,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    isConnectable: true,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  } as unknown as NodeProps

  it('renders detailed children when zoom is above threshold', () => {
    viewportState.zoom = 0.75
    renderWithFlow(
      <NodeComponent
        nodeProps={baseNodeProps}
        topBarColor="var(--pf-t--global--color--nonstatus--blue--200)"
        semanticZoomSummary={{ title: 'T', typeLabel: 'Agentic' }}
      >
        <span>Detailed body</span>
      </NodeComponent>
    )

    expect(screen.getByText('Detailed body')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'T, Agentic' })).not.toBeInTheDocument()
  })

  it('renders semantic color block when zoom is at threshold', () => {
    viewportState.zoom = 0.5
    renderWithFlow(
      <NodeComponent
        nodeProps={baseNodeProps}
        topBarColor="var(--pf-t--global--color--nonstatus--blue--200)"
        semanticZoomSummary={{ title: 'Analyze', typeLabel: 'Agentic' }}
      >
        <span>Detailed body</span>
      </NodeComponent>
    )

    expect(screen.queryByText('Detailed body')).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Analyze, Agentic' })).toBeInTheDocument()
  })

  it('semantic zoom layout has no accessibility violations', async () => {
    viewportState.zoom = 0.5
    const { container } = renderWithFlow(
      <NodeComponent
        nodeProps={baseNodeProps}
        topBarColor="var(--pf-t--global--color--nonstatus--blue--200)"
        semanticZoomSummary={{ title: 'Analyze', typeLabel: 'Agentic' }}
      >
        <span>Detailed body</span>
      </NodeComponent>
    )

    expect(await axe(container)).toHaveNoViolations()
  })
})
