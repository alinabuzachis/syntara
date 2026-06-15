import { EdgeHandleEnum, type SwitchActivity } from '@ansible/nexus-contracts'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithHeader } from '../node-forms/test-utils/renderWithHeader'
import { buildSwitchCasePort } from '../utils/switchCaseHelpers'

import { SwitchNodeDetails } from './SwitchNodeDetails'

let uuidCounter = 0
vi.mock('../../../utils/generateUUID', () => ({
  generateUUID: () => `stable-uuid-${uuidCounter++}`,
}))

const mockUpdateActivity = vi.fn()
const mockSetEdges = vi.fn()
const mockGetState = vi.fn()

vi.mock('../../../stores/useWorkflowStore', () => ({
  useWorkflowStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({ currentWorkflow: null, isDirty: false, edges: [] }),
    {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- mock store
      getState: () => mockGetState(),
    }
  ),
  useWorkflowStoreActions: () => ({
    updateActivity: mockUpdateActivity,
  }),
}))

vi.mock('../../../providers/alerts', () => ({
  useAlerts: () => ({
    showError: vi.fn(),
    showSuccess: vi.fn(),
  }),
}))

describe('SwitchNodeDetails', () => {
  const baseSwitchData: SwitchActivity = {
    id: 'switch-1',
    type: 'switch',
    name: 'Route Request',
    parameters: {
      cases: [
        { port: buildSwitchCasePort(0), label: 'Path 1', condition: '${trigger.priority} > 7' },
        { port: buildSwitchCasePort(1), label: 'Path 2', condition: '${trigger.status} == "rejected"' },
      ],
      default_port: EdgeHandleEnum.DEFAULT,
    },
  }

  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    uuidCounter = 0
    mockGetState.mockReturnValue({
      edges: [
        { id: 'e1', source: 'switch-1', target: 'node-a', sourceHandle: buildSwitchCasePort(0) },
        { id: 'e2', source: 'switch-1', target: 'node-b', sourceHandle: buildSwitchCasePort(1) },
        { id: 'e3', source: 'switch-1', target: 'node-c', sourceHandle: EdgeHandleEnum.DEFAULT },
      ],
      setEdges: mockSetEdges,
    })
  })

  describe('Rendering', () => {
    it('renders the switch form with pre-populated data', () => {
      renderWithHeader(<SwitchNodeDetails switchData={baseSwitchData} nodeId="switch-1" onClose={mockOnClose} />)

      expect(screen.getByPlaceholderText(/Enter activity name/i)).toHaveValue('Route Request')
    })

    it('renders path labels from backend config', () => {
      renderWithHeader(<SwitchNodeDetails switchData={baseSwitchData} nodeId="switch-1" onClose={mockOnClose} />)

      expect(screen.getByDisplayValue('Path 1')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Path 2')).toBeInTheDocument()
    })

    it('renders with empty config gracefully', () => {
      const emptySwitch: SwitchActivity = {
        id: 'switch-empty',
        type: 'switch',
        name: 'Empty Switch',
        parameters: { cases: [], default_port: EdgeHandleEnum.DEFAULT },
      }

      renderWithHeader(<SwitchNodeDetails switchData={emptySwitch} nodeId="switch-empty" onClose={mockOnClose} />)

      expect(screen.getByPlaceholderText(/Enter activity name/i)).toHaveValue('Empty Switch')
    })

    it('renders with missing config gracefully', () => {
      const noConfigSwitch = {
        id: 'switch-no-config',
        type: 'switch',
        name: 'No Config',
        parameters: {},
      } as unknown as SwitchActivity

      renderWithHeader(
        <SwitchNodeDetails switchData={noConfigSwitch} nodeId="switch-no-config" onClose={mockOnClose} />
      )

      expect(screen.getByPlaceholderText(/Enter activity name/i)).toHaveValue('No Config')
    })
  })

  describe('Expression parsing', () => {
    it('parses simple equality condition', () => {
      const switchWithEquality: SwitchActivity = {
        id: 'switch-eq',
        type: 'switch',
        name: 'Equality Check',
        parameters: {
          cases: [{ port: buildSwitchCasePort(0), label: 'Path 1', condition: '${status} == "active"' }],
          default_port: EdgeHandleEnum.DEFAULT,
        },
      }

      renderWithHeader(<SwitchNodeDetails switchData={switchWithEquality} nodeId="switch-eq" onClose={mockOnClose} />)

      expect(screen.getByPlaceholderText(/Enter activity name/i)).toHaveValue('Equality Check')
    })

    it('handles unparseable condition as fallback', () => {
      const switchWithComplex: SwitchActivity = {
        id: 'switch-complex',
        type: 'switch',
        name: 'Complex',
        parameters: {
          cases: [{ port: buildSwitchCasePort(0), label: 'Path 1', condition: 'some_complex && expression || thing' }],
          default_port: EdgeHandleEnum.DEFAULT,
        },
      }

      renderWithHeader(
        <SwitchNodeDetails switchData={switchWithComplex} nodeId="switch-complex" onClose={mockOnClose} />
      )

      expect(screen.getByPlaceholderText(/Enter activity name/i)).toHaveValue('Complex')
    })

    it('parses negated condition correctly', () => {
      const switchWithNot: SwitchActivity = {
        id: 'switch-not',
        type: 'switch',
        name: 'Negated',
        parameters: {
          cases: [{ port: buildSwitchCasePort(0), label: 'Path 1', condition: 'not (${status} == "active")' }],
          default_port: EdgeHandleEnum.DEFAULT,
        },
      }

      renderWithHeader(<SwitchNodeDetails switchData={switchWithNot} nodeId="switch-not" onClose={mockOnClose} />)

      expect(screen.getByPlaceholderText(/Enter activity name/i)).toHaveValue('Negated')
    })
  })

  describe('Header content', () => {
    it('calls onHeaderContentChange', () => {
      const mockOnHeaderContentChange = vi.fn()
      render(
        <SwitchNodeDetails
          switchData={baseSwitchData}
          nodeId="switch-1"
          onClose={mockOnClose}
          onHeaderContentChange={mockOnHeaderContentChange}
        />
      )

      expect(mockOnHeaderContentChange).toHaveBeenCalledWith(expect.anything())
    })
  })

  describe('Edge remapping on submit', () => {
    it('remaps surviving edges when middle case is deleted', async () => {
      const threeCaseSwitch: SwitchActivity = {
        id: 'switch-1',
        type: 'switch',
        name: 'Three Cases',
        parameters: {
          cases: [
            { port: buildSwitchCasePort(0), label: 'Path A', condition: '${trigger.a} == "1"' },
            { port: buildSwitchCasePort(1), label: 'Path B', condition: '${trigger.b} == "2"' },
            { port: buildSwitchCasePort(2), label: 'Path C', condition: '${trigger.c} == "3"' },
          ],
          default_port: EdgeHandleEnum.DEFAULT,
        },
      }

      mockGetState.mockReturnValue({
        edges: [
          { id: 'e0', source: 'switch-1', target: 'node-a', sourceHandle: buildSwitchCasePort(0) },
          { id: 'e1', source: 'switch-1', target: 'node-b', sourceHandle: buildSwitchCasePort(1) },
          { id: 'e2', source: 'switch-1', target: 'node-c', sourceHandle: buildSwitchCasePort(2) },
          { id: 'e3', source: 'switch-1', target: 'node-d', sourceHandle: EdgeHandleEnum.DEFAULT },
        ],
        setEdges: mockSetEdges,
      })

      const user = userEvent.setup()
      renderWithHeader(<SwitchNodeDetails switchData={threeCaseSwitch} nodeId="switch-1" onClose={mockOnClose} />)

      const removeButtons = screen.getAllByRole('button', { name: /remove path/i })
      await user.click(removeButtons[1])

      fireEvent.submit(screen.getByTestId('switch-node-form'))

      await waitFor(() => {
        expect(mockSetEdges).toHaveBeenCalled()
      })

      const updatedEdges = mockSetEdges.mock.calls[0][0] as Array<{
        id: string
        sourceHandle: string
        target: string
      }>

      expect(updatedEdges.find((e) => e.target === 'node-a')?.sourceHandle).toBe(buildSwitchCasePort(0))
      expect(updatedEdges.find((e) => e.target === 'node-c')?.sourceHandle).toBe(buildSwitchCasePort(1))
      expect(updatedEdges.find((e) => e.target === 'node-d')?.sourceHandle).toBe(EdgeHandleEnum.DEFAULT)
      expect(updatedEdges.find((e) => e.target === 'node-b')).toBeUndefined()
    })

    it('preserves edges with no sourceHandle', async () => {
      mockGetState.mockReturnValue({
        edges: [
          { id: 'e0', source: 'switch-1', target: 'node-a', sourceHandle: buildSwitchCasePort(0) },
          { id: 'e-no-handle', source: 'switch-1', target: 'node-x' },
        ],
        setEdges: mockSetEdges,
      })

      renderWithHeader(<SwitchNodeDetails switchData={baseSwitchData} nodeId="switch-1" onClose={mockOnClose} />)

      fireEvent.submit(screen.getByTestId('switch-node-form'))

      await waitFor(() => {
        expect(mockSetEdges).toHaveBeenCalled()
      })

      const updatedEdges = mockSetEdges.mock.calls[0][0] as Array<{ id: string }>
      expect(updatedEdges.find((e) => e.id === 'e-no-handle')).toBeDefined()
    })

    it('preserves edges with non-switch sourceHandle', async () => {
      mockGetState.mockReturnValue({
        edges: [
          { id: 'e0', source: 'switch-1', target: 'node-a', sourceHandle: buildSwitchCasePort(0) },
          { id: 'e-source', source: 'switch-1', target: 'node-y', sourceHandle: EdgeHandleEnum.SOURCE },
        ],
        setEdges: mockSetEdges,
      })

      renderWithHeader(<SwitchNodeDetails switchData={baseSwitchData} nodeId="switch-1" onClose={mockOnClose} />)

      fireEvent.submit(screen.getByTestId('switch-node-form'))

      await waitFor(() => {
        expect(mockSetEdges).toHaveBeenCalled()
      })

      const updatedEdges = mockSetEdges.mock.calls[0][0] as Array<{ id: string }>
      expect(updatedEdges.find((e) => e.id === 'e-source')).toBeDefined()
    })

    it('preserves default and non-switch edges through changes', async () => {
      mockGetState.mockReturnValue({
        edges: [
          { id: 'e0', source: 'switch-1', target: 'node-a', sourceHandle: buildSwitchCasePort(0) },
          { id: 'e1', source: 'switch-1', target: 'node-b', sourceHandle: buildSwitchCasePort(1) },
          { id: 'e-default', source: 'switch-1', target: 'node-d', sourceHandle: EdgeHandleEnum.DEFAULT },
          { id: 'e-other', source: 'other-node', target: 'node-z', sourceHandle: EdgeHandleEnum.SOURCE },
        ],
        setEdges: mockSetEdges,
      })

      renderWithHeader(<SwitchNodeDetails switchData={baseSwitchData} nodeId="switch-1" onClose={mockOnClose} />)

      fireEvent.submit(screen.getByTestId('switch-node-form'))

      await waitFor(() => {
        expect(mockSetEdges).toHaveBeenCalled()
      })

      const updatedEdges = mockSetEdges.mock.calls[0][0] as Array<{ id: string; sourceHandle: string }>
      expect(updatedEdges.find((e) => e.id === 'e-default')?.sourceHandle).toBe(EdgeHandleEnum.DEFAULT)
      expect(updatedEdges.find((e) => e.id === 'e-other')).toBeDefined()
    })
  })
})
