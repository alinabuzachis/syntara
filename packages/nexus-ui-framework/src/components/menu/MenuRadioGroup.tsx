import { Menu as BaseMenu } from '@base-ui-components/react'

export function MenuRadioGroup(props: BaseMenu.RadioGroup.Props) {
  return <BaseMenu.RadioGroup {...props} className="grid grid-cols-[auto_1fr] gap-x-3" />
}
