import { Switch } from '@patternfly/react-core'

export function SwitchCell(props: {
  checked?: boolean
  showLabels?: boolean
  enabledLabel?: string
  disabledLabel?: string
  readOnly?: boolean
  handleChange?: (checked: boolean) => void
}) {
  const {
    checked = false,
    showLabels = false,
    enabledLabel = 'Enabled',
    disabledLabel = 'Disabled',
    handleChange,
  } = props

  let label: string | undefined
  if (showLabels) {
    label = checked ? enabledLabel : disabledLabel
  }

  return (
    <Switch
      isChecked={checked}
      label={label}
      onChange={(_event, newChecked) => {
        handleChange?.(newChecked)
      }}
    />
  )
}
