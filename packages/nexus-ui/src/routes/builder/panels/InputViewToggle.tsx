import { ToggleGroup, ToggleGroupItem } from '@patternfly/react-core'

export type InputView = 'schema' | 'table' | 'json'

interface InputViewToggleProps {
  activeView: InputView
  onChange: (view: InputView) => void
}

const VIEW_OPTIONS: Array<{ label: string; value: InputView }> = [
  { label: 'Schema', value: 'schema' },
  { label: 'Table', value: 'table' },
  { label: 'JSON', value: 'json' },
]

export function InputViewToggle({ activeView, onChange }: Readonly<InputViewToggleProps>) {
  return (
    <ToggleGroup aria-label="Input view selection">
      {VIEW_OPTIONS.map((option) => (
        <ToggleGroupItem
          key={option.value}
          text={option.label}
          buttonId={`input-view-${option.value}`}
          isSelected={activeView === option.value}
          onChange={() => onChange(option.value)}
        />
      ))}
    </ToggleGroup>
  )
}
