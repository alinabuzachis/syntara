import { Icon } from '@patternfly/react-core'
import { AngleDownIcon } from '@patternfly/react-icons'
import { useContext } from 'react'

import { NodeExpandedContext } from './NodeExpandedContext'

export function NodeExpandToggle() {
  const expandedState = useContext(NodeExpandedContext)
  const expanded = expandedState ? expandedState[0] : false
  const setExpanded = expandedState ? expandedState[1] : () => {}
  if (!expandedState) return null
  return (
    <Icon
      onClick={(e) => {
        e.stopPropagation()
        setExpanded((expanded) => !expanded)
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.stopPropagation()
        }
      }}
      className="nodrag nopan"
      style={{
        transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
        transition: 'transform 0.2s ease-out',
        cursor: 'pointer',
      }}
    >
      <AngleDownIcon />
    </Icon>
  )
}
