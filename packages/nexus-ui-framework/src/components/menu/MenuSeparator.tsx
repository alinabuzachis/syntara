import { Menu as BaseMenu } from '@base-ui-components/react'

export function MenuSeparator(props: BaseMenu.Separator.Props) {
  return <BaseMenu.Separator {...props} className="my-1 border-t border-violet-300/20" />
}
