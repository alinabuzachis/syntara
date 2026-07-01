import { Button } from '@patternfly/react-core'

import { useNavigate } from '../../hooks/routing/useNavigate'

import styles from './LinkCell.module.css'

export function LinkCell(props: Readonly<{ href: string; children: React.ReactNode }>) {
  const navigate = useNavigate()

  return (
    <Button variant="link" isInline onClick={() => navigate(props.href)} className={styles.root}>
      {props.children}
    </Button>
  )
}
