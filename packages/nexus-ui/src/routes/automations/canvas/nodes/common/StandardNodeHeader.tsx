import { NodeExpandToggle } from './NodeExpandToggle'
import { NodeHeader } from './NodeHeader'
import { NodeIcon } from './NodeIcon'
import { NodeTitle } from './NodeTitle'

interface StandardNodeHeaderProps {
  icon?: React.ReactNode
  title: string
  subtitle: string
  expandable?: boolean
}

/**
 * Standard node header component that combines icon, title, subtitle, and optional expand toggle.
 * Reduces boilerplate in node component implementations.
 */
export function StandardNodeHeader(props: StandardNodeHeaderProps) {
  return (
    <NodeHeader>
      {props.icon && <NodeIcon>{props.icon}</NodeIcon>}
      <NodeTitle title={props.title} subTitle={props.subtitle} />
      {props.expandable && <NodeExpandToggle />}
    </NodeHeader>
  )
}
