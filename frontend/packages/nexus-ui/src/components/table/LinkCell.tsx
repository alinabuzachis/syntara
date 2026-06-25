import { Button } from '@patternfly/react-core'

import { useNavigate } from '../../hooks/routing/useNavigate'

import styles from './LinkCell.module.css'

export function LinkCell(props: { href: string; children: React.ReactNode; className?: string }) {
  const setLocation = useNavigate()
  const className = [styles.root, props.className].filter(Boolean).join(' ')

  return (
    <Button variant="link" isInline onClick={() => setLocation(props.href)} className={className}>
      {props.children}
    </Button>
  )
}
