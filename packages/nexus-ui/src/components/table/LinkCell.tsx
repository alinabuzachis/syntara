import { Button } from '@patternfly/react-core'
import { useLocation } from 'wouter'

export function LinkCell(props: { href: string; children: React.ReactNode }) {
  const [, setLocation] = useLocation()

  return (
    <Button variant="link" isInline onClick={() => setLocation(props.href)} style={{ textDecoration: 'none' }}>
      {props.children}
    </Button>
  )
}
