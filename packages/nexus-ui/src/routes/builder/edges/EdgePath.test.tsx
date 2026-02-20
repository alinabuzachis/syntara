/**
 * EdgePath Component Tests
 *
 * Tests for edge rendering and execution status styling
 */

import { render } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

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
  const expectStroke = (style: string | null, expectedHex: string, expectedRgb: string) => {
    expect(style).toMatch(new RegExp(`stroke:\\s*(${expectedHex}|${expectedRgb})`))
  }

  describe('execution status styling', () => {
    it('renders solid gray edge for passed status', () => {
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

      const baseEdge = container.querySelector('[data-testid="base-edge"]')
      expect(baseEdge).toBeInTheDocument()

      const style = baseEdge?.getAttribute('style')
      expectStroke(style, '#6b7280', 'rgb\\(107, 114, 128\\)')
      expect(style).toContain('stroke-opacity: 1')
      expect(style).toContain('stroke-dasharray: none')
    })

    it('renders dashed dimmed edge for pending status', () => {
      const { container } = render(
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

      const baseEdge = container.querySelector('[data-testid="base-edge"]')
      expect(baseEdge).toBeInTheDocument()

      const style = baseEdge?.getAttribute('style')
      expectStroke(style, '#9ca3af', 'rgb\\(156, 163, 175\\)')
      expect(style).toContain('stroke-opacity: 0.4')
      expect(style).toContain('stroke-dasharray: 5,5')
    })

    it('uses default styling when no execution status', () => {
      const { container } = render(
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

      const baseEdge = container.querySelector('[data-testid="base-edge"]')
      expect(baseEdge).toBeInTheDocument()

      const style = baseEdge?.getAttribute('style')
      expectStroke(style, '#6b7280', 'rgb\\(107, 114, 128\\)') // default
      expect(style).toContain('stroke-opacity: 1')
      expect(style).toContain('stroke-dasharray: none')
    })
  })

  describe('interactive states', () => {
    it('highlights edge on hover when no execution status', () => {
      const { container } = render(
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

      const baseEdge = container.querySelector('[data-testid="base-edge"]')
      const style = baseEdge?.getAttribute('style')
      expectStroke(style, '#e5e7eb', 'rgb\\(229, 231, 235\\)') // highlighted
      expect(style).toContain('filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.2))')
    })

    it('highlights edge when selected and no execution status', () => {
      const { container } = render(
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

      const baseEdge = container.querySelector('[data-testid="base-edge"]')
      const style = baseEdge?.getAttribute('style')
      expectStroke(style, '#e5e7eb', 'rgb\\(229, 231, 235\\)') // highlighted
      expect(style).toContain('filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.2))')
    })

    it('highlights edge when active and no execution status', () => {
      const { container } = render(
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

      const baseEdge = container.querySelector('[data-testid="base-edge"]')
      const style = baseEdge?.getAttribute('style')
      expectStroke(style, '#e5e7eb', 'rgb\\(229, 231, 235\\)') // highlighted
      expect(style).toContain('filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.2))')
    })
  })

  describe('execution status precedence', () => {
    it('uses passed status styling even when hovered', () => {
      const { container } = render(
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

      const baseEdge = container.querySelector('[data-testid="base-edge"]')
      const style = baseEdge?.getAttribute('style')
      // Execution status takes precedence
      expectStroke(style, '#6b7280', 'rgb\\(107, 114, 128\\)') // passed
      expect(style).toContain('stroke-dasharray: none')
      // But still applies hover filter
      expect(style).toContain('filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.2))')
    })

    it('uses passed status styling even when selected', () => {
      const { container } = render(
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

      const baseEdge = container.querySelector('[data-testid="base-edge"]')
      const style = baseEdge?.getAttribute('style')
      // Execution status takes precedence
      expectStroke(style, '#6b7280', 'rgb\\(107, 114, 128\\)') // passed
      expect(style).toContain('stroke-dasharray: none')
      // But still applies selected filter
      expect(style).toContain('filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.2))')
    })

    it('uses pending status styling even when active', () => {
      const { container } = render(
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

      const baseEdge = container.querySelector('[data-testid="base-edge"]')
      const style = baseEdge?.getAttribute('style')
      // Execution status takes precedence
      expectStroke(style, '#9ca3af', 'rgb\\(156, 163, 175\\)') // pending
      expect(style).toContain('stroke-opacity: 0.4')
      expect(style).toContain('stroke-dasharray: 5,5')
      // But still applies active filter
      expect(style).toContain('filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.2))')
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

      // Should have two paths: visible edge + invisible hover detection
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

      // Check that no path has pointer-events: stroke
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

      const marker = container.querySelector('marker#pending-arrow-marker')
      expect(marker).toBeInTheDocument()

      const polyline = marker?.querySelector('polyline')
      expect(polyline).toBeInTheDocument()
      expect(polyline?.getAttribute('stroke')).toBe('#e5e7eb')
      expect(polyline?.getAttribute('fill')).toBe('#e5e7eb')
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

      const baseEdge = container.querySelector('[data-testid="base-edge"]')
      expect(baseEdge).toBeInTheDocument()

      const marker = container.querySelector('marker#pending-arrow-marker')
      expect(marker).not.toBeInTheDocument()
    })
  })

  describe('stroke width and pointer events', () => {
    it('applies consistent stroke width', () => {
      const { container } = render(
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

      const baseEdge = container.querySelector('[data-testid="base-edge"]')
      const style = baseEdge?.getAttribute('style')
      expect(style).toContain('stroke-width: 2')
      expect(style).toContain('pointer-events: none')
    })
  })
})
