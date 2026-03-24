import { Button, Icon, Tooltip } from '@patternfly/react-core'
import { RhUiHistoryIcon } from '@patternfly/react-icons'

interface RunHistoryToggleButtonProps {
  onClick: () => void
  isActive?: boolean
}

export function RunHistoryToggleButton({ onClick, isActive }: RunHistoryToggleButtonProps) {
  return (
    <Tooltip content="Run history">
      <Button
        variant="plain"
        isClicked={isActive}
        onClick={onClick}
        icon={
          <Icon isInline>
            <RhUiHistoryIcon />
          </Icon>
        }
        aria-label="Run history"
      />
    </Tooltip>
  )
}
