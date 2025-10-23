import clsx from 'clsx'
import { useContext, type ReactNode } from 'react'
import { NodeExpandedContext } from './NodeExpandedContext'

export function NodeBody(props: { children: ReactNode; className?: string }) {
  const [expanded] = useContext(NodeExpandedContext)
  if (!expanded) {
    return null
  }
  return <div className={clsx('px-6', props.className)}>{props.children}</div>
}
