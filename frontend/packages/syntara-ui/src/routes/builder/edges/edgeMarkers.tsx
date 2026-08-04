import { CANVAS_EDGE_HIGHLIGHT_STROKE } from './buttonEdgeStrokeColor'
import styles from './edgeMarkers.module.css'

/**
 * Shared SVG marker definitions for edge arrow states (selected, hover).
 * Wrapped in a zero-size `<svg>` so the SVG namespace is available when rendered
 * as a child of `<ReactFlow>` (which places children in an HTML div context).
 */
export function EdgeMarkers() {
  return (
    <svg className={styles.hiddenSvg}>
      <defs>
        <marker
          id="selected-arrow-marker"
          markerWidth="12"
          markerHeight="12"
          viewBox="-10 -10 20 20"
          orient="auto"
          refX="-5"
          refY="0"
        >
          <polyline
            stroke={CANVAS_EDGE_HIGHLIGHT_STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1"
            fill={CANVAS_EDGE_HIGHLIGHT_STROKE}
            points="-5,-4 0,0 -5,4 -5,-4"
          />
        </marker>
        <marker
          id="hover-arrow-marker"
          markerWidth="12"
          markerHeight="12"
          viewBox="-10 -10 20 20"
          orient="auto"
          refX="-5"
          refY="0"
        >
          <polyline
            stroke={CANVAS_EDGE_HIGHLIGHT_STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1"
            fill={CANVAS_EDGE_HIGHLIGHT_STROKE}
            points="-5,-4 0,0 -5,4 -5,-4"
          />
        </marker>
      </defs>
    </svg>
  )
}
