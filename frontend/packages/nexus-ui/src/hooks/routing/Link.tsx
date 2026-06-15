import React from 'react'
import { Link as WouterLink } from 'wouter'

type LinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string
}

/**
 * Routing bridge: anchor-based navigation link accepting `href` and standard anchor attributes.
 *
 * Delegates to wouter today; the implementation will be replaced with TanStack Router
 * during migration without requiring changes to consumers.
 */
export function Link({ href, ...rest }: Readonly<LinkProps>) {
  return <WouterLink href={href} {...rest} />
}
