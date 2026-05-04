import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { InputPanel } from './InputPanel'

const mockUseUpstreamNodes = vi.fn<(...args: unknown[]) => { id: string; name: string; type: string }[]>()
vi.mock('./hooks/useUpstreamNodes', () => ({
  useUpstreamNodes: (...args: unknown[]) =>
    mockUseUpstreamNodes(...args) as { id: string; name: string; type: string }[],
}))

const mockActivities = vi.fn<() => { id: string; name: string; type: string }[] | undefined>()
const mockTriggers = vi.fn<() => { id: string; name: string; type: string }[] | undefined>()
vi.mock('../../../stores/useWorkflowStore', () => ({
  useWorkflowStore: (selector: (state: unknown) => unknown) =>
    selector({
      currentWorkflow: {
        workflow: { activities: mockActivities() ?? [] },
        triggers: mockTriggers() ?? [],
      },
    }),
}))

const upstreamNodes = [{ id: 'upstream-1', name: 'Previous Step', type: 'script' }]

const executionData = {
  'upstream-1': {
    timestamp: '2025-11-14T13:00:12.004-7:00',
    'Readable date': 'November 14th 2025, 8:17:40 AM',
    Year: 2025,
  },
}

describe('InputPanel', () => {
  it('shows "not connected" empty state when no upstream nodes exist', () => {
    mockUseUpstreamNodes.mockReturnValue([])

    render(<InputPanel nodeId="node-1" />)

    expect(screen.getByText('No input data')).toBeInTheDocument()
    expect(screen.getByText('Input data can only be displayed when a node is connected and run')).toBeInTheDocument()
  })

  it('shows schema preview when upstream node type has a known schema and no execution data', async () => {
    mockUseUpstreamNodes.mockReturnValue(upstreamNodes)

    render(<InputPanel nodeId="node-1" />)

    await waitFor(
      () => {
        expect(screen.getByText('Expected output fields (run node to see actual values)')).toBeInTheDocument()
        expect(screen.getByRole('tree', { name: 'Schema preview' })).toBeInTheDocument()
        expect(screen.getByText('T stdout')).toBeInTheDocument()
        expect(screen.getByText('# return_code')).toBeInTheDocument()
      },
      { timeout: 15_000 }
    )
  }, 20_000)

  it('shows empty state when upstream node type has no known schema and no execution data', () => {
    mockUseUpstreamNodes.mockReturnValue([{ id: 'upstream-1', name: 'Unknown Step', type: 'unknown_type' }])

    render(<InputPanel nodeId="node-1" />)

    expect(screen.getByText('Input not available')).toBeInTheDocument()
    expect(screen.getByText('Run previous node to populate input')).toBeInTheDocument()
  })

  it('renders header with "Input" title', () => {
    mockUseUpstreamNodes.mockReturnValue([])

    render(<InputPanel nodeId="node-1" />)

    expect(screen.getByRole('heading', { name: 'Input' })).toBeInTheDocument()
  })

  it('passes the nodeId to useUpstreamNodes', () => {
    mockUseUpstreamNodes.mockReturnValue([])

    render(<InputPanel nodeId="test-node-42" />)

    expect(mockUseUpstreamNodes).toHaveBeenCalledWith('test-node-42')
  })

  it('renders Schema view by default when execution data exists', () => {
    mockUseUpstreamNodes.mockReturnValue(upstreamNodes)

    render(<InputPanel nodeId="node-1" executionData={executionData} />)

    expect(screen.getByText('T timestamp')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Schema', pressed: true })).toBeInTheDocument()
  })

  it('switches to Table view when Table toggle clicked', async () => {
    const user = userEvent.setup()
    mockUseUpstreamNodes.mockReturnValue(upstreamNodes)

    render(<InputPanel nodeId="node-1" executionData={executionData} />)

    await user.click(screen.getByRole('button', { name: 'Table' }))

    expect(screen.getByRole('button', { name: 'Table', pressed: true })).toBeInTheDocument()
  })

  it('switches to JSON view when JSON toggle clicked', async () => {
    const user = userEvent.setup()
    mockUseUpstreamNodes.mockReturnValue(upstreamNodes)

    render(<InputPanel nodeId="node-1" executionData={executionData} />)

    await user.click(screen.getByRole('button', { name: 'JSON' }))

    expect(screen.getByRole('button', { name: 'JSON', pressed: true })).toBeInTheDocument()
  })

  it('renders collapsible Variables and context section', async () => {
    const user = userEvent.setup()
    mockUseUpstreamNodes.mockReturnValue(upstreamNodes)

    render(<InputPanel nodeId="node-1" executionData={executionData} />)

    const toggle = screen.getByRole('button', { name: /Variables and context/i })
    expect(toggle).toBeInTheDocument()

    await user.click(toggle)

    expect(screen.getByText('T $now')).toBeInTheDocument()
    expect(screen.getByText('T $today')).toBeInTheDocument()
  })

  it('shows schema preview via sourceNodeId fallback when no edges exist', () => {
    mockUseUpstreamNodes.mockReturnValue([])
    mockActivities.mockReturnValue([{ id: 'source-1', name: 'Fetch Data', type: 'script' }])

    render(<InputPanel nodeId="" sourceNodeId="source-1" />)

    expect(screen.getByText('Expected output fields (run node to see actual values)')).toBeInTheDocument()
    expect(screen.getByText('T stdout')).toBeInTheDocument()
    expect(screen.getByText('# return_code')).toBeInTheDocument()
  })

  describe('chain deletion and reconnection with execution data', () => {
    // 6-node chain: trigger → A → B → C → D → E
    // All are script nodes so they have known output schemas
    const fullChain = [
      { id: 'node-a', name: 'Step A', type: 'script' },
      { id: 'node-b', name: 'Step B', type: 'script' },
      { id: 'node-c', name: 'Step C', type: 'script' },
      { id: 'node-d', name: 'Step D', type: 'script' },
      { id: 'node-e', name: 'Step E', type: 'script' },
      { id: 'trigger-1', name: 'Trigger', type: 'manual_trigger' },
    ]

    const chainExecutionData = {
      'trigger-1': { timestamp: '2025-01-01T00:00:00Z' },
      'node-a': { stdout: 'output-a', return_code: 0 },
      'node-b': { stdout: 'output-b', return_code: 0 },
      'node-c': { stdout: 'output-c', return_code: 0 },
      'node-d': { stdout: 'output-d', return_code: 0 },
    }

    it('shows execution data from direct predecessor in a full chain', () => {
      mockUseUpstreamNodes.mockReturnValue(fullChain)

      render(<InputPanel nodeId="node-e" executionData={chainExecutionData} />)

      // Default selected node is the first upstream (node-a) — shows its real data
      expect(screen.getByRole('button', { name: 'Schema', pressed: true })).toBeInTheDocument()
      expect(screen.getByText('output-a')).toBeInTheDocument()
    })

    it('shows node selector dropdown when multiple upstream nodes exist', () => {
      mockUseUpstreamNodes.mockReturnValue(fullChain)

      render(<InputPanel nodeId="node-e" executionData={chainExecutionData} />)

      // Dropdown should appear because there are 6 upstream nodes
      expect(screen.getByRole('button', { name: 'Step A' })).toBeInTheDocument()
    })

    it('can switch between upstream nodes to view different execution data', async () => {
      const user = userEvent.setup()
      mockUseUpstreamNodes.mockReturnValue(fullChain)

      render(<InputPanel nodeId="node-e" executionData={chainExecutionData} />)

      // Initially shows first upstream node's data (Step A)
      expect(screen.getByText('output-a')).toBeInTheDocument()

      // Open dropdown and select Step D
      await user.click(screen.getByRole('button', { name: 'Step A' }))
      await user.click(screen.getByRole('option', { name: /Step D/i }))

      // Now shows Step D's data
      expect(screen.getByText('output-d')).toBeInTheDocument()
    })

    it('after deleting a middle node, downstream only sees remaining connected ancestors', () => {
      // Delete node-c: node-e now only sees node-d (isolated after the break)
      const brokenChain = [{ id: 'node-d', name: 'Step D', type: 'script' }]
      mockUseUpstreamNodes.mockReturnValue(brokenChain)

      const brokenExecutionData = {
        'node-d': { stdout: 'output-d', return_code: 0 },
      }

      render(<InputPanel nodeId="node-e" executionData={brokenExecutionData} />)

      // Shows node-d's data, no dropdown (only 1 upstream)
      expect(screen.getByText('output-d')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Step A' })).not.toBeInTheDocument()
    })

    it('after deleting a middle node, the pre-break chain remains intact', () => {
      // node-b still sees node-a and trigger (unaffected by the break after node-c)
      const preBreakChain = [
        { id: 'node-a', name: 'Step A', type: 'script' },
        { id: 'trigger-1', name: 'Trigger', type: 'manual_trigger' },
      ]
      mockUseUpstreamNodes.mockReturnValue(preBreakChain)

      const preBreakExecutionData = {
        'node-a': { stdout: 'output-a', return_code: 0 },
        'trigger-1': { timestamp: '2025-01-01T00:00:00Z' },
      }

      render(<InputPanel nodeId="node-b" executionData={preBreakExecutionData} />)

      // Shows node-a's data, dropdown available to switch to trigger
      expect(screen.getByText('output-a')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Step A' })).toBeInTheDocument()
    })

    it('after reconnecting the chains, full ancestor data is available again', async () => {
      const user = userEvent.setup()
      // Reconnect: node-b → node-d (skipping deleted node-c)
      const reconnectedChain = [
        { id: 'node-d', name: 'Step D', type: 'script' },
        { id: 'node-b', name: 'Step B', type: 'script' },
        { id: 'node-a', name: 'Step A', type: 'script' },
        { id: 'trigger-1', name: 'Trigger', type: 'manual_trigger' },
      ]
      mockUseUpstreamNodes.mockReturnValue(reconnectedChain)

      const reconnectedExecutionData = {
        'node-d': { stdout: 'output-d', return_code: 0 },
        'node-b': { stdout: 'output-b', return_code: 0 },
        'node-a': { stdout: 'output-a', return_code: 0 },
        'trigger-1': { timestamp: '2025-01-01T00:00:00Z' },
      }

      render(<InputPanel nodeId="node-e" executionData={reconnectedExecutionData} />)

      // Default shows first upstream (node-d)
      expect(screen.getByText('output-d')).toBeInTheDocument()

      // Switch to Step A via dropdown
      await user.click(screen.getByRole('button', { name: 'Step D' }))
      await user.click(screen.getByRole('option', { name: /Step A/i }))

      expect(screen.getByText('output-a')).toBeInTheDocument()

      // Switch to Step B
      await user.click(screen.getByRole('button', { name: 'Step A' }))
      await user.click(screen.getByRole('option', { name: /Step B/i }))

      expect(screen.getByText('output-b')).toBeInTheDocument()
    })

    it('schema preview reflects broken chain when no execution data exists', () => {
      // Same broken chain scenario but without execution data (design-time)
      const brokenChain = [{ id: 'node-d', name: 'Step D', type: 'script' }]
      mockUseUpstreamNodes.mockReturnValue(brokenChain)

      render(<InputPanel nodeId="node-e" />)

      // Shows schema preview for script node (Step D), no dropdown
      expect(screen.getByText('Expected output fields (run node to see actual values)')).toBeInTheDocument()
      expect(screen.getByText('T stdout')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Step A' })).not.toBeInTheDocument()
    })

    it('schema preview shows all ancestors after reconnection without execution data', () => {
      // Reconnected chain, design-time (no execution data)
      const reconnectedChain = [
        { id: 'node-d', name: 'Step D', type: 'script' },
        { id: 'node-b', name: 'Step B', type: 'script' },
        { id: 'node-a', name: 'Step A', type: 'script' },
        { id: 'trigger-1', name: 'Trigger', type: 'manual_trigger' },
      ]
      mockUseUpstreamNodes.mockReturnValue(reconnectedChain)

      render(<InputPanel nodeId="node-e" />)

      // Shows schema preview, dropdown available for switching between ancestors
      expect(screen.getByText('Expected output fields (run node to see actual values)')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Step D' })).toBeInTheDocument()
    })
  })

  it('has no accessibility violations when not connected', async () => {
    mockUseUpstreamNodes.mockReturnValue([])

    const { container } = render(<InputPanel nodeId="node-1" />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations when connected but not run', async () => {
    mockUseUpstreamNodes.mockReturnValue(upstreamNodes)

    const { container } = render(<InputPanel nodeId="node-1" />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
