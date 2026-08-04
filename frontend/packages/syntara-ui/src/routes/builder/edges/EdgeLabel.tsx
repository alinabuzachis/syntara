import { EdgeLabelRenderer } from '@xyflow/react'
import React from 'react'

import styles from './EdgeLabel.module.css'

type EdgeLabelProps = {
  /** X coordinate for positioning the label */
  labelX: number
  /** Y coordinate for positioning the label */
  labelY: number
  /** Label content to display */
  label?: React.ReactNode
}

/**
 * Shared edge label component
 * Renders a label on an edge if provided
 * Currently unused but available for future use
 */
export function EdgeLabel(props: EdgeLabelProps) {
  const { labelX, labelY, label } = props

  if (!label) {
    return null
  }

  return (
    <EdgeLabelRenderer>
      <div
        style={{
          position: 'absolute',
          transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
        }}
        className={`nodrag nopan ${styles.edgeLabel}`}
      >
        {label}
      </div>
    </EdgeLabelRenderer>
  )
}
