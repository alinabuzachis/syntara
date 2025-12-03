import {
  Compass as PFCompass,
  CompassHeader as PFCompassHeader,
  CompassPanel as PFCompassPanel,
  CompassContent as PFCompassContent,
  type CompassProps as PFCompassProps,
} from '@patternfly/react-core'
import clsx from 'clsx'

// Compass Main Component
export type CompassProps = PFCompassProps & {
  glass?: boolean
}

export function Compass({ className, glass, ...rest }: CompassProps) {
  return <PFCompass className={clsx(glass && 'glass', className)} {...rest} />
}

// CompassHeader Component
interface CompassHeaderProps {
  /** Content of the logo area */
  logo?: React.ReactNode
  /** Content of the navigation area */
  nav?: React.ReactNode
  /** Content of the profile area */
  profile?: React.ReactNode
}

export function CompassHeader(props: CompassHeaderProps) {
  return <PFCompassHeader {...props} />
}

// CompassPanel Component
interface CompassPanelProps extends React.HTMLProps<HTMLDivElement> {
  /** Content of the panel. */
  children: React.ReactNode
  /** Additional classes added to the panel. */
  className?: string
  /** Indicates the panel should have a pill border radius */
  isPill?: boolean
  /** Indicates the panel should expand to fill the available height */
  isFullHeight?: boolean
  /** Indicates the panel should scroll its overflow */
  isScrollable?: boolean
  /** Indicates the panel should have no border */
  hasNoBorder?: boolean
  /** Indicates the panel should have no padding */
  hasNoPadding?: boolean
  /** Indicates the panel should have a "thinking" animation */
  isThinking?: boolean
  /** Apply glass effect */
  glass?: boolean
}

export function CompassPanel({ className, glass, ...rest }: CompassPanelProps) {
  return <PFCompassPanel className={clsx(glass && 'glass card', className)} {...rest} />
}

// CompassContent Component
interface CompassContentProps extends React.HTMLProps<HTMLDivElement> {
  /** Content of the main compass area. Typically one or more CompassPanel components. */
  children: React.ReactNode
  /** Additional classes added to the CompassContent */
  className?: string
  /** Content rendered in an optional drawer wrapping the CompassContent */
  drawerContent?: React.ReactNode
  /** Additional props passed to the drawer */
  drawerProps?: Record<string, unknown>
  /** Apply glass effect */
  glass?: boolean
}

export function CompassContent({ className, glass, ...rest }: CompassContentProps) {
  return <PFCompassContent className={clsx(glass && 'glass', className)} {...rest} />
}
