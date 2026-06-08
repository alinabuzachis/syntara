import { Button } from '@patternfly/react-core'
import { useLocation } from 'wouter'

export function LinkCell(props: { href: string; children: React.ReactNode }) {
  const [, setLocation] = useLocation()

  return (
    <Button
      variant="link"
      isInline
      onClick={() => setLocation(props.href)}
      style={{ textDecoration: 'none', maxWidth: '100%', overflow: 'hidden' }}
    >
      {props.children}
    </Button>
  )
}
