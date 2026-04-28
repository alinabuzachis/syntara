import { Stack, StackItem, type StackItemProps } from '@patternfly/react-core'
import type { ReactNode } from 'react'

import styles from './AppPage.module.css'

/** Fills `CompassContent` (last child gets `flex-grow` in Compass CSS) so the page column + `AppPanel` heights resolve. */
export function AppPage(props: { children: React.ReactNode }) {
  return (
    <Stack hasGutter style={{ flex: 1, minHeight: 0 }}>
      {props.children}
    </Stack>
  )
}

export type AppPageMainProps = Omit<StackItemProps, 'isFilled' | 'children'> & {
  children: ReactNode
}

/**
 * Use as the **filled** row under `AppPage` (below `AppPageHeader`): `StackItem` + `isFilled` +
 * flex `min-height: 0` so full-height panels and inner scroll areas size correctly.
 * Pass `className` / `style` for overflow, padding, centered empty states, etc.
 *
 * For the same flex behavior **inside** a nested `Stack` (e.g. builder side panels), prefer
 * `StackItem` + `isFilled` + `className={styles.main}` from `./AppPage.module.css` so the slot
 * is not misread as a page-level `AppPage` child.
 */
export function AppPageMain({ children, className, style, ...rest }: AppPageMainProps) {
  const mergedClass = [styles.main, className].filter(Boolean).join(' ')
  return (
    <StackItem isFilled className={mergedClass} style={style} {...rest}>
      {children}
    </StackItem>
  )
}
