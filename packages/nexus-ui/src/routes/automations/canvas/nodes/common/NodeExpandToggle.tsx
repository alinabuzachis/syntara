import clsx from 'clsx'
import { ChevronDownIcon } from 'lucide-react'
import { useContext } from 'react'
import { NodeExpandedContext } from './NodeExpandedContext'

export function NodeExpandToggle() {
  const [expanded, setExpanded] = useContext(NodeExpandedContext)
  return (
    <ChevronDownIcon
      onClick={() => setExpanded((expanded) => !expanded)}
      className={clsx('transition-all ease-out', { 'rotate-180': expanded })}
    />
  )
}
