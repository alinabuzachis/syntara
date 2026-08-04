import { Link as TanStackLink } from '@tanstack/react-router'
import { type ComponentProps } from 'react'

type LinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string
}

type TanStackTo = ComponentProps<typeof TanStackLink>['to']

/**
 * @deprecated Use `Link` from `@tanstack/react-router` directly.
 */
export function Link({ href, children, ...rest }: Readonly<LinkProps>) {
  return (
    <TanStackLink to={href as TanStackTo} {...(rest as Omit<ComponentProps<typeof TanStackLink>, 'to' | 'children'>)}>
      {children}
    </TanStackLink>
  )
}
