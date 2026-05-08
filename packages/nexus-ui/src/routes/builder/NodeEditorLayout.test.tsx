import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

vi.mock('../../providers/alerts', () => ({
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

  it('calls form submit when close button is clicked with formId', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(
      <>
        <form id="test-form" data-testid="test-form">
          <input type="text" />
        </form>
        <NodeEditorLayout
          parametersContent={<div>Parameters</div>}
          showInputPanel={true}
          nodeId="node-1"
          formId="test-form"
          onClose={onClose}
        />
      </>
    )

    const form = screen.getByTestId<HTMLFormElement>('test-form')
    const submitSpy = vi.spyOn(form, 'requestSubmit')

    await user.click(screen.getByRole('button', { name: /Save and close/i }))

    expect(submitSpy).toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onClose when close button is clicked with formId but element is not a form', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(
      <>
        <div id="test-form">Not a form</div>
        <NodeEditorLayout
          parametersContent={<div>Parameters</div>}
          showInputPanel={true}
          nodeId="node-1"
          formId="test-form"
          onClose={onClose}
        />
      </>
    )

    await user.click(screen.getByRole('button', { name: /Save and close/i }))

    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when close button is clicked without formId', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(
      <NodeEditorLayout
        parametersContent={<div>Parameters</div>}
        showInputPanel={true}
        nodeId="node-1"
        onClose={onClose}
      />
    )

    await user.click(screen.getByRole('button', { name: /Save and close/i }))

    expect(onClose).toHaveBeenCalled()
  })

  it('does not render close button when showClose is false', () => {
    render(
      <NodeEditorLayout
        parametersContent={<div>Parameters</div>}
        showInputPanel={true}
        nodeId="node-1"
        showClose={false}
      />
    )

    expect(screen.queryByRole('button', { name: /Close and save/i })).not.toBeInTheDocument()
  })

  it('renders header icon when provided', () => {
    render(
      <NodeEditorLayout
        parametersContent={<div>Parameters</div>}
        showInputPanel={false}
        headerIcon={<span data-testid="custom-icon">Icon</span>}
      />
    )

    expect(screen.getByTestId('custom-icon')).toBeInTheDocument()
  })

  it('renders header content when provided', () => {
    render(
      <NodeEditorLayout
        parametersContent={<div>Parameters</div>}
        showInputPanel={false}
        headerContent={<span>Custom Header</span>}
      />
    )

    expect(screen.getByText('Custom Header')).toBeInTheDocument()
  })

  it('renders header actions when provided', () => {
    render(
      <NodeEditorLayout
        parametersContent={<div>Parameters</div>}
        showInputPanel={false}
        headerActions={<button type="button">Action</button>}
      />
    )

    expect(screen.getByRole('button', { name: /Action/i })).toBeInTheDocument()
  })

  it('renders Cancel button when showClose is true', () => {
    render(
      <NodeEditorLayout
        parametersContent={<div>Parameters</div>}
        showInputPanel={true}
        nodeId="node-1"
        onClose={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: /Cancel without saving/i })).toBeInTheDocument()
  })

  it('calls onClose when Cancel button is clicked without form submission', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(
      <>
        <form id="test-form" data-testid="test-form">
          <input type="text" />
        </form>
        <NodeEditorLayout
          parametersContent={<div>Parameters</div>}
          showInputPanel={true}
          nodeId="node-1"
          formId="test-form"
          onClose={onClose}
        />
      </>
    )

    const form = screen.getByTestId<HTMLFormElement>('test-form')
    const submitSpy = vi.spyOn(form, 'requestSubmit')

    await user.click(screen.getByRole('button', { name: /Cancel without saving/i }))

    expect(onClose).toHaveBeenCalled()
    expect(submitSpy).not.toHaveBeenCalled()
  })

  it('does not render Cancel and minimize buttons when showClose is false', () => {
    render(
      <NodeEditorLayout
        parametersContent={<div>Parameters</div>}
        showInputPanel={true}
        nodeId="node-1"
        showClose={false}
      />
    )

    expect(screen.queryByRole('button', { name: /Cancel without saving/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Save and close/i })).not.toBeInTheDocument()
  })

  it('minimize button has tooltip with "Save and close" text', () => {
    render(
      <NodeEditorLayout
        parametersContent={<div>Parameters</div>}
        showInputPanel={true}
        nodeId="node-1"
        onClose={vi.fn()}
      />
    )

    const minimizeButton = screen.getByRole('button', { name: /Save and close/i })
    expect(minimizeButton).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <NodeEditorLayout parametersContent={<div>Parameters</div>} showInputPanel={true} nodeId="node-1" />
    )

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
