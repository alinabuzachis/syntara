import { Menu as BaseMenu } from '@base-ui-components/react'
import clsx from 'clsx'

export function MenuTrigger(props: BaseMenu.Trigger.Props) {
  return <BaseMenu.Trigger {...props} className={clsx('menu-trigger', props.className)} />
}
