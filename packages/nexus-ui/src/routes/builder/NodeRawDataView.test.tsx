import { render, screen } from '@testing-library/react'
import type { Node } from '@xyflow/react'
import { describe, expect, it } from 'vitest'

import type { NodeType } from '../automations/canvas/nodes/NodeType'

import { NodeRawDataView } from './NodeRawDataView'

describe('NodeRawDataView Component', () => {
  it('renders node type correctly', () => {
    const node: Node<NodeType['data']> = {
      id: 'test-node-1',
      type: 'join',
      position: { x: 0, y: 0 },
      data: {
        type: 'join',
        id: 'test-node-1',
        name: 'Test Join Node',
      },
    }

    render(<NodeRawDataView node={node} />)

    expect(screen.getByText('Node Type')).toBeInTheDocument()
    expect(screen.getByText('join')).toBeInTheDocument()
  })

  it('renders node ID correctly', () => {
    const node: Node<NodeType['data']> = {
      id: 'my-custom-id',
      type: 'parallel',
      position: { x: 0, y: 0 },
      data: {},
    }

    render(<NodeRawDataView node={node} />)

    expect(screen.getByText('Node ID')).toBeInTheDocument()
    expect(screen.getByText('my-custom-id')).toBeInTheDocument()
  })

  it('renders node data as formatted JSON', () => {
    const node: Node<NodeType['data']> = {
      id: 'data-test',
      type: 'join',
      position: { x: 100, y: 200 },
      data: {
        type: 'join',
        id: 'data-test',
        name: 'Test Data',
        customField: 'custom value',
      },
    }

    render(<NodeRawDataView node={node} />)

    expect(screen.getByText('Node Data')).toBeInTheDocument()

    // Check that the JSON is displayed
    const preElement = screen.getByText(/Test Data/)
    expect(preElement).toBeInTheDocument()
    expect(preElement.textContent).toContain('"type": "join"')
    expect(preElement.textContent).toContain('"name": "Test Data"')
    expect(preElement.textContent).toContain('"customField": "custom value"')
  })

  it('capitalizes node type in display', () => {
    const node: Node<NodeType['data']> = {
      id: 'test',
      type: 'trigger',
      position: { x: 0, y: 0 },
      data: {},
    }

    render(<NodeRawDataView node={node} />)

    const nodeTypeDiv = screen.getByText('trigger')
    expect(nodeTypeDiv).toHaveClass('capitalize')
  })

  it('uses monospace font for node ID', () => {
    const node: Node<NodeType['data']> = {
      id: 'monospace-test',
      type: 'task',
      position: { x: 0, y: 0 },
      data: {},
    }

    render(<NodeRawDataView node={node} />)

    const nodeIdDiv = screen.getByText('monospace-test')
    expect(nodeIdDiv).toHaveClass('font-mono')
  })

  it('handles empty node data', () => {
    const node: Node<NodeType['data']> = {
      id: 'empty-data',
      type: 'join',
      position: { x: 0, y: 0 },
      data: {},
    }

    render(<NodeRawDataView node={node} />)

    expect(screen.getByText('Node Data')).toBeInTheDocument()
    const preElement = screen.getByText('{}')
    expect(preElement).toBeInTheDocument()
  })

  it('handles complex nested data structures', () => {
    const node: Node<NodeType['data']> = {
      id: 'complex-node',
      type: 'condition',
      position: { x: 0, y: 0 },
      data: {
        type: 'condition',
        id: 'complex-node',
        name: 'Complex Condition',
        condition: 'input.value > 10',
        then: [
          {
            type: 'task',
            id: 'nested-task',
            name: 'Nested Task',
            task: {
              executor: 'script',
              config: {
                language: 'python',
                code: 'print("nested")',
              },
            },
          },
        ],
      },
    }

    render(<NodeRawDataView node={node} />)

    const preElement = screen.getByText(/Complex Condition/)
    expect(preElement.textContent).toContain('"condition": "input.value > 10"')
    expect(preElement.textContent).toContain('"then"')
    expect(preElement.textContent).toContain('"executor": "script"')
  })

  it('applies correct styling classes', () => {
    const node: Node<NodeType['data']> = {
      id: 'style-test',
      type: 'task',
      position: { x: 0, y: 0 },
      data: {},
    }

    const { container } = render(<NodeRawDataView node={node} />)

    // Check main container has correct classes
    const mainDiv = container.firstChild as HTMLElement
    expect(mainDiv).toHaveClass('flex', 'flex-col', 'gap-4')

    // Check that divs have bg-white/5 class
    const bgDivs = container.querySelectorAll('.bg-white\\/5')
    expect(bgDivs.length).toBeGreaterThan(0)
  })
})
