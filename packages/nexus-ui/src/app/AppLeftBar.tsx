import { Button, CompassPanel, Flex, FlexItem, Icon } from '@patternfly/react-core'
import { ClosedCaptioningIcon, LayerGroupIcon, PlusSquareIcon, VolumeIcon } from '@patternfly/react-icons'

export function AppLeftBar() {
  return (
    <CompassPanel>
      <Flex direction={{ default: 'column' }} gap={{ default: 'gapNone' }}>
        <FlexItem>
          <Button
            variant="plain"
            aria-label="Add"
            icon={
              <Icon>
                <PlusSquareIcon />
              </Icon>
            }
          />
        </FlexItem>

        <FlexItem>
          <Button
            variant="plain"
            aria-label="Layers"
            icon={
              <Icon>
                <LayerGroupIcon />
              </Icon>
            }
          />
        </FlexItem>

        <FlexItem>
          <Button
            variant="plain"
            aria-label="AI"
            icon={<div className="ai-shadow flex h-6 w-6 items-center justify-center rounded-full" />}
          />
        </FlexItem>

        <FlexItem>
          <Button
            variant="plain"
            aria-label="Volume"
            icon={
              <Icon>
                <VolumeIcon />
              </Icon>
            }
          />
        </FlexItem>

        <FlexItem>
          <Button
            variant="plain"
            aria-label="Closed Captioning"
            icon={
              <Icon>
                <ClosedCaptioningIcon />
              </Icon>
            }
          />
        </FlexItem>
      </Flex>
    </CompassPanel>
  )
}
