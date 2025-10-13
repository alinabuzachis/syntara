import { Menu as BaseMenu } from '@base-ui-components/react'

export function MenuRadioItem(props: BaseMenu.RadioItem.Props) {
  const { children, ...rest } = props
  return (
    <BaseMenu.RadioItem
      {...rest}
      className="col-span-2 grid grid-cols-subgrid rounded-lg px-3 py-1.5 hover:bg-white/10 data-[checked]:bg-violet-500/20"
    >
      <BaseMenu.RadioItemIndicator className="h-2 w-2 self-center rounded-full bg-violet-400"></BaseMenu.RadioItemIndicator>
      <div className="col-start-2">{children}</div>
    </BaseMenu.RadioItem>
  )
}
