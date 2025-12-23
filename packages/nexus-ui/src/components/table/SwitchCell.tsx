import { Switch } from '@patternfly/react-core'
import { useState, useEffect } from 'react'

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
  const [isChecked, setIsChecked] = useState(checked)

  // Update local state when prop changes
  useEffect(() => {
    setIsChecked(checked)
  }, [checked])

  return (
    <Switch
      isChecked={isChecked}
      label={showLabels ? (isChecked ? enabledLabel : disabledLabel) : undefined}
      onChange={(_event, newChecked) => {
        // Update local state for visual toggle
        setIsChecked(newChecked)
        // Call handleChange (even if empty, allows toggle without API calls)
        handleChange?.(newChecked)
      }}
    />
  )
}
