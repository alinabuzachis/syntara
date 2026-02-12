import type { TaskActivity } from '@ansible/nexus-contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { GenericNodeComponent } from './GenericNode'

// Mock @xyflow/react
vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({
    deleteElements: vi.fn(),
    updateNode: vi.fn(),
    getNode: vi.fn(),
  }),
  Handle: () => null,
  Position: {
    Top: 'top',
    Bottom: 'bottom',
    Left: 'left',
    Right: 'right',
  },
}))

describe('GenericNodeComponent', () => {
  const baseGenericNode: TaskActivity = {
    type: 'task',
    id: 'generic-1',
    name: 'Placeholder',
    task: {
      executor: 'script',
      config: {
        language: 'python',
        code: '',
      },
    },
  }

  const createNodeProps = (data: TaskActivity) => ({
    id: data.id,
    data,
    type: 'generic' as const,
    position: { x: 0, y: 0 },
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    selected: false,
    dragging: false,
    isConnectable: true,
    zIndex: 0,
    selectable: true,
    deletable: true,
    draggable: true,
  })

  describe('Rendering', () => {
    it('renders default message "Select a node type"', () => {
      render(<GenericNodeComponent {...createNodeProps(baseGenericNode)} />)

      expect(screen.getByText('Select a node type')).toBeInTheDocument()
    })

    it('renders "Click to configure" title by default', () => {
      render(<GenericNodeComponent {...createNodeProps(baseGenericNode)} />)

      expect(screen.getByText('Click to configure')).toBeInTheDocument()
    })
  })

  describe('Custom Message', () => {
    it('renders custom message when provided in metadata', () => {
      const nodeWithCustomMessage = {
        ...baseGenericNode,
        metadata: {
          __customMessage: 'Configure this step',
        },
      } as TaskActivity

      render(<GenericNodeComponent {...createNodeProps(nodeWithCustomMessage)} />)

      expect(screen.getByText('Configure this step')).toBeInTheDocument()
    })

    it('does not show title when custom message is present', () => {
      const nodeWithCustomMessage = {
        ...baseGenericNode,
        metadata: {
          __customMessage: 'Custom setup message',
        },
      } as TaskActivity

      render(<GenericNodeComponent {...createNodeProps(nodeWithCustomMessage)} />)

      expect(screen.queryByText('Click to configure')).not.toBeInTheDocument()
    })
  })

  describe('Reverse Handles', () => {
    it('handles reverseHandles metadata for loop-back paths', () => {
      const nodeWithReverseHandles = {
        ...baseGenericNode,
        metadata: {
          __reverseHandles: true,
        },
      } as TaskActivity

      render(<GenericNodeComponent {...createNodeProps(nodeWithReverseHandles)} />)

      // Should render without crashing
      expect(screen.getByText('Select a node type')).toBeInTheDocument()
    })
  })

  describe('Execution State', () => {
    it('handles execution state data', () => {
      const nodeWithExecution = {
        ...baseGenericNode,
        __executionState: {
          status: 'pending',
        },
      } as TaskActivity

      render(<GenericNodeComponent {...createNodeProps(nodeWithExecution)} />)

      // Should render without crashing
      expect(screen.getByText('Select a node type')).toBeInTheDocument()
    })
  })

  describe('Node Structure', () => {
    it('renders with correct structure', () => {
      const { container } = render(<GenericNodeComponent {...createNodeProps(baseGenericNode)} />)

      expect(container.querySelector('.pf-v6-c-compass__panel')).toBeInTheDocument()
    })

    it('renders with dashed border styling', () => {
      const { container } = render(<GenericNodeComponent {...createNodeProps(baseGenericNode)} />)

      // The component passes hasDashedBorder prop to NodeComponent
      // Check that the node is rendered (dashed border is handled by NodeComponent)
      expect(container.querySelector('.pf-v6-c-compass__panel')).toBeInTheDocument()
    })
  })

  describe('Selection State', () => {
    it('renders when selected', () => {
      const props = createNodeProps(baseGenericNode)
      props.selected = true

      render(<GenericNodeComponent {...props} />)

      expect(screen.getByText('Select a node type')).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('handles empty metadata object', () => {
      const nodeWithEmptyMetadata = {
        ...baseGenericNode,
        metadata: {},
      } as TaskActivity

      render(<GenericNodeComponent {...createNodeProps(nodeWithEmptyMetadata)} />)

      expect(screen.getByText('Select a node type')).toBeInTheDocument()
      expect(screen.getByText('Click to configure')).toBeInTheDocument()
    })
  })
})
