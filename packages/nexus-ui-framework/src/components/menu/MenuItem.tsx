import { Menu as BaseMenu } from '@base-ui-components/react'
import clsx from 'clsx'

export function MenuItem(props: BaseMenu.Item.Props) {
  return <BaseMenu.Item {...props} className={clsx('menu-item', props.className)} />
}
