import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { NodeEditorLayout } from './NodeEditorLayout'

vi.mock('./panels/InputPanel', () => ({
  InputPanel: ({
    nodeId,
    executionData,
    sourceNodeId,
  }: {
    nodeId: string
    executionData?: unknown
    sourceNodeId?: string | null
  }) => (
    <div data-testid="input-panel">
      Input for {nodeId}
      {executionData ? <span data-testid="input-has-data">has data</span> : null}
      {sourceNodeId ? <span data-testid="input-source-node">{sourceNodeId}</span> : null}
    </div>
  ),
}))

vi.mock('./panels/OutputPanel', () => ({
  OutputPanel: ({ outputData }: { outputData?: unknown }) => (
    <div data-testid="output-panel">{outputData ? <span data-testid="output-has-data">has data</span> : null}</div>
  ),
}))

const mockUseNodeExecutionData = vi.fn()

vi.mock('./panels/hooks/useNodeExecutionData', () => ({
  useNodeExecutionData: (...args: unknown[]): { inputData: null; outputData: null; isLoading: boolean } =>
    mockUseNodeExecutionData(...args) as { inputData: null; outputData: null; isLoading: boolean },
}))

vi.mock('../../components/alerts', () => ({
  useAlerts: vi.fn(() => ({ showInfo: vi.fn() })),
}))

describe('NodeEditorLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseNodeExecutionData.mockReturnValue({
      inputData: null,
      outputData: null,
      isLoading: false,
    })
  })

  it('renders InputPanel in left column when showInputPanel is true and nodeId is provided', () => {
    render(<NodeEditorLayout parametersContent={<div>Parameters</div>} showInputPanel={true} nodeId="node-42" />)

    const inputPanel = screen.getByTestId('input-panel')
    expect(inputPanel).toBeInTheDocument()
    expect(inputPanel).toHaveTextContent('Input for node-42')
  })

  it('does not render InputPanel when showInputPanel is false', () => {
    render(<NodeEditorLayout parametersContent={<div>Parameters</div>} showInputPanel={false} nodeId="node-42" />)

    expect(screen.queryByTestId('input-panel')).not.toBeInTheDocument()
  })

  it('renders parameters content in center column', () => {
    render(<NodeEditorLayout parametersContent={<div>My Parameters Content</div>} showInputPanel={false} />)

    expect(screen.getByText('My Parameters Content')).toBeInTheDocument()
  })

  it('renders OutputPanel in right column', () => {
    render(<NodeEditorLayout parametersContent={<div>Parameters</div>} showInputPanel={false} />)

    expect(screen.getByTestId('output-panel')).toBeInTheDocument()
  })

  it('passes executionId to useNodeExecutionData hook', () => {
    render(
      <NodeEditorLayout
        parametersContent={<div>Parameters</div>}
        showInputPanel={false}
        nodeId="node-1"
        executionId="exec-99"
      />
    )

    expect(mockUseNodeExecutionData).toHaveBeenCalledWith('node-1', 'exec-99', undefined)
  })

  it('passes empty string nodeId to hook when nodeId is not provided', () => {
    render(<NodeEditorLayout parametersContent={<div>Parameters</div>} showInputPanel={false} executionId="exec-99" />)

    expect(mockUseNodeExecutionData).toHaveBeenCalledWith('', 'exec-99', undefined)
  })

  it('passes executionData from hook to InputPanel', () => {
    mockUseNodeExecutionData.mockReturnValue({
      inputData: { 'upstream-1': { value: 'test' } },
      outputData: null,
      isLoading: false,
    })

    render(
      <NodeEditorLayout
        parametersContent={<div>Parameters</div>}
        showInputPanel={true}
        nodeId="node-1"
        executionId="exec-1"
      />
    )

    expect(screen.getByTestId('input-has-data')).toBeInTheDocument()
  })

  it('passes outputData from hook to OutputPanel', () => {
    mockUseNodeExecutionData.mockReturnValue({
      inputData: null,
      outputData: { result: 'hello' },
      isLoading: false,
    })

    render(
      <NodeEditorLayout
        parametersContent={<div>Parameters</div>}
        showInputPanel={false}
        nodeId="node-1"
        executionId="exec-1"
      />
    )

    expect(screen.getByTestId('output-has-data')).toBeInTheDocument()
  })

  it('passes sourceNodeId to InputPanel when provided', () => {
    render(
      <NodeEditorLayout
        parametersContent={<div>Parameters</div>}
        showInputPanel={true}
        nodeId="node-1"
        sourceNodeId="source-1"
      />
    )

    const sourceNode = screen.getByTestId('input-source-node')
    expect(sourceNode).toHaveTextContent('source-1')
  })

  it('does not render sourceNodeId indicator when not provided', () => {
    render(<NodeEditorLayout parametersContent={<div>Parameters</div>} showInputPanel={true} nodeId="node-1" />)

    expect(screen.queryByTestId('input-source-node')).not.toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <NodeEditorLayout parametersContent={<div>Parameters</div>} showInputPanel={true} nodeId="node-1" />
    )

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
