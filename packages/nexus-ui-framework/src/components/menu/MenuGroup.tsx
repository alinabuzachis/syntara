import { Menu as BaseMenu } from '@base-ui-components/react'

export function MenuGroup(props: BaseMenu.Group.Props & { label: string }) {
  return (
    <BaseMenu.Group {...props} className="pb-1">
      <BaseMenu.GroupLabel className="px-3 py-1.5 text-sm font-medium text-white/70">{props.label}</BaseMenu.GroupLabel>
      {props.children}
    </BaseMenu.Group>
  )
}
