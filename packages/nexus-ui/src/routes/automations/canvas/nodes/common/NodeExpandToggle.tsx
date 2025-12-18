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
      onClick={() => setExpanded((expanded) => !expanded)}
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
