import { Switch } from '@patternfly/react-core'

type EnabledWorkflowSwitchProps = Readonly<{
  isEnabled: boolean
  isSaving: boolean
  onToggle: (checked: boolean) => void
}>

/**
 * Enable/Disable switch for workflows.
 * Delegates toggle handling to parent which decides whether to save immediately or show dialog.
 */
export function EnabledWorkflowSwitch({ isEnabled, isSaving, onToggle }: EnabledWorkflowSwitchProps) {
  return (
    <Switch
      isChecked={isEnabled}
      isDisabled={isSaving}
      onChange={(_event, checked) => {
        onToggle(checked)
      }}
      label={isEnabled ? 'Enabled' : 'Disabled'}
      hasCheckIcon
    />
  )
}
