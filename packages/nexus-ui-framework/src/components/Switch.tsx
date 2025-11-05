import { Switch as BaseSwitch } from '@base-ui-components/react/switch'
import React from 'react'

export interface SwitchProps extends React.ComponentProps<typeof BaseSwitch.Root> {
  handleChange: (checked: boolean) => void
  showLabels?: boolean
  enabledLabel?: string
  disabledLabel?: string
  readOnly?: boolean
}

export function Switch(props: SwitchProps) {
  const {
    handleChange: propHandleChange,
    showLabels = false,
    enabledLabel = 'Enabled',
    disabledLabel = 'Disabled',
    readOnly = false,
    ...baseProps
  } = props
  const [checked, setChecked] = React.useState(props?.checked)

  const handleChange = () => {
    if (readOnly) return
    const newValue = !checked
    setChecked(newValue)
    propHandleChange(newValue)
  }

  return (
    <div className="flex items-center gap-2">
      <BaseSwitch.Root
        className={`relative flex h-4 w-7 rounded-full bg-gradient-to-r from-green-600 from-35% to-gray-200 to-65% bg-[length:6.5rem_100%] bg-[100%_0%] bg-no-repeat p-px shadow-[inset_0_1.5px_2px] shadow-gray-200 outline outline-1 -outline-offset-1 outline-gray-200 transition-[background-position,box-shadow] duration-[125ms] ease-[cubic-bezier(0.26,0.75,0.38,0.45)] before:absolute before:rounded-full before:outline-offset-2 before:outline-blue-800 focus-visible:before:inset-0 focus-visible:before:outline focus-visible:before:outline-2 active:bg-gray-100 data-[checked]:bg-[0%_0%] data-[checked]:active:bg-gray-500 dark:from-green-600 dark:shadow-black/75 dark:outline-white/15 dark:data-[checked]:shadow-none ${readOnly ? 'cursor-default opacity-70' : 'cursor-pointer'}`}
        {...baseProps}
        checked={checked}
        onClick={() => handleChange()}
      >
        <BaseSwitch.Thumb className="aspect-square h-full rounded-full bg-gray-800 shadow-[0_0_1px_1px,0_1px_1px,1px_2px_4px_-1px] shadow-gray-100 transition-transform duration-150 data-[checked]:translate-x-3 dark:shadow-black/25" />
      </BaseSwitch.Root>
      {showLabels && <span className="text-sm text-white/80">{checked ? enabledLabel : disabledLabel}</span>}
    </div>
  )
}
