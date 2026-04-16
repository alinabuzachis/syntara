import type { SettingsAPI } from '@ansible/nexus-contracts'
import { ActionGroup, Button, Form, FormSection } from '@patternfly/react-core'
import { useMemo } from 'react'

import { ConfirmationDialog } from '../../../components/ConfirmationDialog'
import { useDialogState } from '../../../hooks/useDialogState'

import { SettingField } from './SettingField'
import { valuesEqual } from './valuesEqual'

type RuntimeSetting = SettingsAPI.components['schemas']['RuntimeSettingRead']

interface SettingsCategoryTabProps {
  readonly settings: RuntimeSetting[]
  readonly edits: Map<string, unknown>
  readonly onChange: (key: string, value: unknown) => void
  readonly onResetField: (key: string) => void
  readonly onValidationChange?: (key: string, hasError: boolean) => void
}

export function SettingsCategoryTab({
  settings,
  edits,
  onChange,
  onResetField,
  onValidationChange,
}: SettingsCategoryTabProps) {
  const resetDialog = useDialogState()

  const groups = useMemo(() => {
    const grouped = new Map<string, RuntimeSetting[]>()
    for (const setting of settings) {
      const group = setting.group ?? ''
      if (!grouped.has(group)) grouped.set(group, [])
      grouped.get(group)!.push(setting)
    }
    // Order each group: toggle (first boolean) → non-booleans → other booleans
    for (const groupSettings of grouped.values()) {
      const toggle = groupSettings.find((s) => s.value_type === 'boolean')
      if (!toggle) continue
      const rest = groupSettings.filter((s) => s !== toggle)
      const nonBooleans = rest.filter((s) => s.value_type !== 'boolean')
      const otherBooleans = rest.filter((s) => s.value_type === 'boolean')
      groupSettings.length = 0
      groupSettings.push(toggle, ...nonBooleans, ...otherBooleans)
    }
    return grouped
  }, [settings])

  const getDisplayValue = (setting: RuntimeSetting) => {
    if (edits.has(setting.key)) return edits.get(setting.key)
    return setting.effective_value
  }

  const hasNonDefaults = settings.some((s) => {
    const displayValue = edits.has(s.key) ? edits.get(s.key) : s.effective_value
    return !valuesEqual(displayValue, s.default_value)
  })

  const handleResetAll = () => {
    for (const setting of settings) {
      onChange(setting.key, setting.default_value)
    }
    resetDialog.close()
  }

  return (
    <Form>
      {Array.from(groups.entries()).map(([groupName, groupSettings]) => {
        const toggleSetting = groupSettings.find((s) => s.value_type === 'boolean')
        const isGroupEnabled = !toggleSetting || Boolean(getDisplayValue(toggleSetting))

        return (
          <FormSection key={groupName} title={groupName || undefined}>
            {groupSettings.map((setting) => {
              if (setting.value_type !== 'boolean' && !isGroupEnabled) return null

              return (
                <SettingField
                  key={setting.key}
                  setting={setting}
                  value={getDisplayValue(setting)}
                  onChange={onChange}
                  onResetSingle={onResetField}
                  onValidationChange={onValidationChange}
                />
              )
            })}
          </FormSection>
        )
      })}

      <ActionGroup>
        <Button variant="secondary" onClick={() => resetDialog.open(undefined)} isDisabled={!hasNonDefaults}>
          Reset to defaults
        </Button>
      </ActionGroup>

      <ConfirmationDialog
        isOpen={resetDialog.isOpen}
        onClose={resetDialog.close}
        onConfirm={handleResetAll}
        title="Reset settings"
        titleIconVariant="warning"
        confirmLabel="Reset all"
        confirmVariant="danger"
      >
        This will reset all configuration values on this page to their factory defaults. These changes will not take
        effect until you click Save changes.
      </ConfirmationDialog>
    </Form>
  )
}
