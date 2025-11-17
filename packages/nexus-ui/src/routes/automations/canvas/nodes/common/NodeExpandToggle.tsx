import clsx from 'clsx'
import { ChevronDownIcon } from 'lucide-react'
import { useContext } from 'react'

import { NodeExpandedContext } from './NodeExpandedContext'

export function NodeExpandToggle() {
  const expandedState = useContext(NodeExpandedContext)
  const expanded = expandedState ? expandedState[0] : false
  const setExpanded = expandedState ? expandedState[1] : () => {}
  if (!expandedState) return null
  return (
    <ChevronDownIcon
      onClick={() => setExpanded((expanded) => !expanded)}
      className={clsx('transition-all ease-out', { 'rotate-180': expanded })}
    />
  )
}
