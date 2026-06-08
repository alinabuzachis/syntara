/**
 * EdgePath Component Tests
 *
 * Tests for edge rendering and execution status styling
 */

import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import {
  BUTTON_EDGE_DEFAULT_STROKE,
  CANVAS_EDGE_HIGHLIGHT_STROKE,
  CANVAS_EDGE_MUTED_STROKE,
} from './buttonEdgeStrokeColor'
import { EDGE_INTERACTION_DROP_SHADOW } from './edgeInteractionStyles'
import { EdgePath } from './EdgePath'

// Mock @xyflow/react BaseEdge component
vi.mock('@xyflow/react', () => ({
  BaseEdge: ({ path, markerEnd, style }: { path: string; markerEnd?: string; style?: React.CSSProperties }) => (
    <path data-testid="base-edge" d={path} markerEnd={markerEnd} style={style} />
  ),
}))

describe('EdgePath', () => {
  const mockEdgePath = 'M 0 0 L 100 100'
  const mockOnMouseEnter = vi.fn()
  const mockOnMouseLeave = vi.fn()
  const expectStrokeVar = (style: string | null, token: string) => {
    expect(style).toContain(`stroke: ${token}`)
  }

  describe('execution status styling', () => {
    it('renders solid gray edge for passed status', () => {
      render(
        <svg>
          <EdgePath
            edgePath={mockEdgePath}
            markerEnd="url(#arrow)"
            selected={false}
            isEdgeHovered={false}
            data={{ executionStatus: 'passed' }}
            onMouseEnter={mockOnMouseEnter}
            onMouseLeave={mockOnMouseLeave}
          />
        </svg>
      )

      const baseEdge = screen.getByTestId('base-edge')
      expect(baseEdge).toBeInTheDocument()

      const style = baseEdge.getAttribute('style')
      expectStrokeVar(style ?? null, BUTTON_EDGE_DEFAULT_STROKE)
      expect(style).toContain('stroke-opacity: 1')
      expect(style).toContain('stroke-dasharray: none')
    })

    it('renders dashed dimmed edge for pending status', () => {
      render(
        <svg>
          <EdgePath
            edgePath={mockEdgePath}
            markerEnd="url(#arrow)"
            selected={false}
            isEdgeHovered={false}
            data={{ executionStatus: 'pending' }}
            onMouseEnter={mockOnMouseEnter}
            onMouseLeave={mockOnMouseLeave}
          />
        </svg>
      )

      const baseEdge = screen.getByTestId('base-edge')
      expect(baseEdge).toBeInTheDocument()

      const style = baseEdge.getAttribute('style')
      expectStrokeVar(style ?? null, CANVAS_EDGE_MUTED_STROKE)
      expect(style).toContain('stroke-opacity: 0.4')
      expect(style).toContain('stroke-dasharray: 5,5')
    })

    it('uses default styling when no execution status', () => {
      render(
        <svg>
          <EdgePath
            edgePath={mockEdgePath}
            markerEnd="url(#arrow)"
            selected={false}
            isEdgeHovered={false}
            data={{}}
            onMouseEnter={mockOnMouseEnter}
            onMouseLeave={mockOnMouseLeave}
          />
        </svg>
      )

      const baseEdge = screen.getByTestId('base-edge')
      expect(baseEdge).toBeInTheDocument()

      const style = baseEdge.getAttribute('style')
      expectStrokeVar(style ?? null, BUTTON_EDGE_DEFAULT_STROKE) // default
      expect(style).toContain('stroke-opacity: 1')
      expect(style).toContain('stroke-dasharray: none')
    })
  })

  describe('approval handle edge coloring', () => {
    it('uses success color when sourceHandle is approved', () => {
      const { container } = render(
        <svg>
          <EdgePath
            edgePath={mockEdgePath}
            markerEnd="url(#arrow)"
            selected={false}
            isEdgeHovered={false}
            data={{}}
            sourceHandle="approved"
            onMouseEnter={mockOnMouseEnter}
            onMouseLeave={mockOnMouseLeave}
          />
        </svg>
      )

      // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access -- SVG has no roles; base-edge is mock-only
      const baseEdge = container.querySelector('[data-testid="base-edge"]')
      const style = baseEdge?.getAttribute('style')
      expect(style).toContain('--pf-t--global--color--status--success--default')
      expect(style).toContain('stroke-opacity: 1')
    })

    it('uses danger color when sourceHandle is rejected', () => {
      const { container } = render(
        <svg>
          <EdgePath
            edgePath={mockEdgePath}
            markerEnd="url(#arrow)"
            selected={false}
            isEdgeHovered={false}
            data={{}}
            sourceHandle="rejected"
            onMouseEnter={mockOnMouseEnter}
            onMouseLeave={mockOnMouseLeave}
          />
        </svg>
      )

      // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access -- SVG has no roles; base-edge is mock-only
      const baseEdge = container.querySelector('[data-testid="base-edge"]')
      const style = baseEdge?.getAttribute('style')
      expect(style).toContain('--pf-t--global--color--status--danger--default')
      expect(style).toContain('stroke-opacity: 1')
    })

    it('execution status overrides approval handle color', () => {
      const { container } = render(
        <svg>
          <EdgePath
            edgePath={mockEdgePath}
            markerEnd="url(#arrow)"
            selected={false}
            isEdgeHovered={false}
            data={{ executionStatus: 'passed' }}
            sourceHandle="approved"
            onMouseEnter={mockOnMouseEnter}
            onMouseLeave={mockOnMouseLeave}
          />
        </svg>
      )

      // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access -- SVG has no roles; base-edge is mock-only
      const baseEdge = container.querySelector('[data-testid="base-edge"]')
      const style = baseEdge?.getAttribute('style')
      // Passed takes precedence over approved
      expectStrokeVar(style ?? null, BUTTON_EDGE_DEFAULT_STROKE)
    })
  })

  describe('interactive states', () => {
    it('highlights edge on hover when no execution status', () => {
      render(
        <svg>
          <EdgePath
            edgePath={mockEdgePath}
            markerEnd="url(#arrow)"
            selected={false}
            isEdgeHovered={true}
            data={{}}
            onMouseEnter={mockOnMouseEnter}
            onMouseLeave={mockOnMouseLeave}
          />
        </svg>
      )

      const baseEdge = screen.getByTestId('base-edge')
      const style = baseEdge.getAttribute('style')
      expectStrokeVar(style ?? null, CANVAS_EDGE_HIGHLIGHT_STROKE) // highlighted
      expect(style).toContain(`filter: ${EDGE_INTERACTION_DROP_SHADOW}`)
    })

    it('highlights edge when selected and no execution status', () => {
      render(
        <svg>
          <EdgePath
            edgePath={mockEdgePath}
            markerEnd="url(#arrow)"
            selected={true}
            isEdgeHovered={false}
            data={{}}
            onMouseEnter={mockOnMouseEnter}
            onMouseLeave={mockOnMouseLeave}
          />
        </svg>
      )

      const baseEdge = screen.getByTestId('base-edge')
      const style = baseEdge.getAttribute('style')
      expectStrokeVar(style ?? null, CANVAS_EDGE_HIGHLIGHT_STROKE) // highlighted
      expect(style).toContain(`filter: ${EDGE_INTERACTION_DROP_SHADOW}`)
    })

    it('highlights edge when active and no execution status', () => {
      render(
        <svg>
          <EdgePath
            edgePath={mockEdgePath}
            markerEnd="url(#arrow)"
            selected={false}
            isEdgeHovered={false}
            data={{ isActive: true }}
            onMouseEnter={mockOnMouseEnter}
            onMouseLeave={mockOnMouseLeave}
          />
        </svg>
      )

      const baseEdge = screen.getByTestId('base-edge')
      const style = baseEdge.getAttribute('style')
      expectStrokeVar(style ?? null, CANVAS_EDGE_HIGHLIGHT_STROKE) // highlighted
      expect(style).toContain(`filter: ${EDGE_INTERACTION_DROP_SHADOW}`)
    })
  })

  describe('execution status precedence', () => {
    it('uses passed status styling even when hovered', () => {
      render(
        <svg>
          <EdgePath
            edgePath={mockEdgePath}
            markerEnd="url(#arrow)"
            selected={false}
            isEdgeHovered={true}
            data={{ executionStatus: 'passed' }}
            onMouseEnter={mockOnMouseEnter}
            onMouseLeave={mockOnMouseLeave}
          />
        </svg>
      )

      const baseEdge = screen.getByTestId('base-edge')
      const style = baseEdge.getAttribute('style')
      // Execution status takes precedence
      expectStrokeVar(style ?? null, BUTTON_EDGE_DEFAULT_STROKE) // passed
      expect(style).toContain('stroke-dasharray: none')
      // But still applies hover filter
      expect(style).toContain(`filter: ${EDGE_INTERACTION_DROP_SHADOW}`)
    })

    it('uses passed status styling even when selected', () => {
      render(
        <svg>
          <EdgePath
            edgePath={mockEdgePath}
            markerEnd="url(#arrow)"
            selected={true}
            isEdgeHovered={false}
            data={{ executionStatus: 'passed' }}
            onMouseEnter={mockOnMouseEnter}
            onMouseLeave={mockOnMouseLeave}
          />
        </svg>
      )

      const baseEdge = screen.getByTestId('base-edge')
      const style = baseEdge.getAttribute('style')
      // Execution status takes precedence
      expectStrokeVar(style ?? null, BUTTON_EDGE_DEFAULT_STROKE) // passed
      expect(style).toContain('stroke-dasharray: none')
      // But still applies selected filter
      expect(style).toContain(`filter: ${EDGE_INTERACTION_DROP_SHADOW}`)
    })

    it('uses pending status styling even when active', () => {
      render(
        <svg>
          <EdgePath
            edgePath={mockEdgePath}
            markerEnd="url(#arrow)"
            selected={false}
            isEdgeHovered={false}
            data={{ executionStatus: 'pending', isActive: true }}
            onMouseEnter={mockOnMouseEnter}
            onMouseLeave={mockOnMouseLeave}
          />
        </svg>
      )

      const baseEdge = screen.getByTestId('base-edge')
      const style = baseEdge.getAttribute('style')
      // Execution status takes precedence
      expectStrokeVar(style ?? null, CANVAS_EDGE_MUTED_STROKE) // pending
      expect(style).toContain('stroke-opacity: 0.4')
      expect(style).toContain('stroke-dasharray: 5,5')
      // But still applies active filter
      expect(style).toContain(`filter: ${EDGE_INTERACTION_DROP_SHADOW}`)
    })
  })

  describe('hover detection path', () => {
    it('renders invisible hover path when not pending', () => {
      const { container } = render(
        <svg>
          <EdgePath
            edgePath={mockEdgePath}
            markerEnd="url(#arrow)"
            selected={false}
            isEdgeHovered={false}
            data={{ executionStatus: 'passed' }}
            onMouseEnter={mockOnMouseEnter}
            onMouseLeave={mockOnMouseLeave}
          />
        </svg>
      )

      // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access -- SVG paths without accessible roles
      const paths = container.querySelectorAll('path')
      expect(paths.length).toBeGreaterThanOrEqual(2)

      // Check for hover detection path with transparent stroke
      const hoverPath = Array.from(paths).find((path) => {
        const style = path.getAttribute('style')
        return style?.includes('pointer-events: stroke')
      })

      expect(hoverPath).toBeInTheDocument()
      expect(hoverPath?.getAttribute('stroke')).toBe('transparent')
    })

    it('does not render hover path for pending edges', () => {
      const { container } = render(
        <svg>
          <EdgePath
            edgePath={mockEdgePath}
            markerEnd="url(#arrow)"
            selected={false}
            isEdgeHovered={false}
            data={{ isPending: true }}
            onMouseEnter={mockOnMouseEnter}
            onMouseLeave={mockOnMouseLeave}
          />
        </svg>
      )

      // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access -- SVG paths without accessible roles
      const paths = container.querySelectorAll('path')
      const hoverPath = Array.from(paths).find((path) => {
        const style = path.getAttribute('style')
        return style?.includes('pointer-events: stroke')
      })

      expect(hoverPath).toBeUndefined()
    })
  })

  describe('custom marker for pending edges', () => {
    it('renders custom marker definition for pending edges', () => {
      const { container } = render(
        <svg>
          <EdgePath
            edgePath={mockEdgePath}
            markerEnd="url(#arrow)"
            selected={false}
            isEdgeHovered={false}
            data={{ isPending: true }}
            onMouseEnter={mockOnMouseEnter}
            onMouseLeave={mockOnMouseLeave}
          />
        </svg>
      )

      // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access -- SVG marker has no role
      const marker = container.querySelector('marker#pending-arrow-marker')
      expect(marker).toBeInTheDocument()

      // eslint-disable-next-line testing-library/no-node-access -- polyline inside defs is not exposed
      const polyline = marker?.querySelector('polyline')
      expect(polyline).toBeInTheDocument()
      expect(polyline?.getAttribute('stroke')).toBe(BUTTON_EDGE_DEFAULT_STROKE)
      expect(polyline?.getAttribute('fill')).toBe(BUTTON_EDGE_DEFAULT_STROKE)
    })

    it('uses BaseEdge for non-pending edges', () => {
      const { container } = render(
        <svg>
          <EdgePath
            edgePath={mockEdgePath}
            markerEnd="url(#arrow)"
            selected={false}
            isEdgeHovered={false}
            data={{ isPending: false }}
            onMouseEnter={mockOnMouseEnter}
            onMouseLeave={mockOnMouseLeave}
          />
        </svg>
      )

      const baseEdge = screen.getByTestId('base-edge')
      expect(baseEdge).toBeInTheDocument()

      // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access -- SVG marker has no role
      const marker = container.querySelector('marker#pending-arrow-marker')
      expect(marker).not.toBeInTheDocument()
    })
  })

  describe('stroke width and pointer events', () => {
    it('applies consistent stroke width', () => {
      render(
        <svg>
          <EdgePath
            edgePath={mockEdgePath}
            markerEnd="url(#arrow)"
            selected={false}
            isEdgeHovered={false}
            data={{}}
            onMouseEnter={mockOnMouseEnter}
            onMouseLeave={mockOnMouseLeave}
          />
        </svg>
      )

      const baseEdge = screen.getByTestId('base-edge')
      const style = baseEdge.getAttribute('style')
      expect(style).toContain('stroke-width: 2')
      expect(style).toContain('pointer-events: none')
    })
  })
})
