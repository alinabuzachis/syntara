import { Checkbox as BaseCheckbox } from '@base-ui-components/react'
import { CheckIcon, MinusIcon } from 'lucide-react'

export function Checkbox(
  props: BaseCheckbox.Root.Props & {
    label?: string
  }
) {
  const { label, ...checkboxProps } = props

  return (
    <label className="flex cursor-pointer items-center gap-2">
      <BaseCheckbox.Root
        {...checkboxProps}
        className="flex size-5 items-center justify-center rounded border-2 border-violet-300/40 bg-white/5 transition-colors hover:border-violet-300/60 data-[state=checked]:border-violet-400 data-[state=checked]:bg-violet-500 data-[state=indeterminate]:border-violet-400 data-[state=indeterminate]:bg-violet-500"
      >
        <BaseCheckbox.Indicator className="flex items-center justify-center text-white">
          {checkboxProps.indeterminate ? <MinusIcon className="size-3.5" /> : <CheckIcon className="size-3.5" />}
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Root>
      {label && <span className="text-xs select-none">{label}</span>}
    </label>
  )
}
