import { NxLink } from '../NxLink'

import styles from './LinkCell.module.css'

/** Renders a table cell value as a client-side router link. */
export function LinkCell(props: Readonly<{ href: string; children: React.ReactNode }>) {
  return (
    <NxLink to={props.href} className={styles.root}>
      {props.children}
    </NxLink>
  )
}
