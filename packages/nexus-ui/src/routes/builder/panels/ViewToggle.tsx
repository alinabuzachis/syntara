import { ToggleGroup, ToggleGroupItem } from '@patternfly/react-core'
import { useId } from 'react'

export type PanelView = 'schema' | 'table' | 'json'

type ViewToggleProps = {
  activeView: PanelView
  onChange: (view: PanelView) => void
  ariaLabel: string
}

const VIEW_OPTIONS: Array<{ label: string; value: PanelView }> = [
  { label: 'Schema', value: 'schema' },
  { label: 'Table', value: 'table' },
  { label: 'JSON', value: 'json' },
]

export function ViewToggle({ activeView, onChange, ariaLabel }: Readonly<ViewToggleProps>) {
  const idPrefix = useId()

  return (
    <ToggleGroup aria-label={ariaLabel} isCompact>
      {VIEW_OPTIONS.map((option) => (
        <ToggleGroupItem
          key={option.value}
          text={option.label}
          buttonId={`${idPrefix}-view-${option.value}`}
          isSelected={activeView === option.value}
          onChange={() => onChange(option.value)}
        />
      ))}
    </ToggleGroup>
  )
}
