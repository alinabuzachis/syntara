import {
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Flex,
  FlexItem,
  Truncate,
} from '@patternfly/react-core'
import { RhUiStarIcon } from '@patternfly/react-icons'
import { Td, Tr } from '@patternfly/react-table'

import { IconLabel } from '../../../components/IconLabel'
import { NxLabel } from '../../../components/labels/NxLabel'
import type { KebabAction } from '../../../components/NxKebabMenu'
import { NxKebabMenu } from '../../../components/NxKebabMenu'

/** Minimal model shape accepted by {@link ModelRow}. */
export type ModelRowModel = Readonly<{
  id: string
  name: string
  description?: string | null
}>

/** Props for a single model row in a selectable table (wizard step 3 or detail Models tab). */
export type ModelRowProps = Readonly<{
  /** The LLM model object. */
  model: ModelRowModel
  /** Row index for PatternFly select accessibility. */
  index: number
  /** Whether the model is currently enabled (checkbox checked). */
  isEnabled: boolean
  /** Whether this model is the default for the integration. */
  isDefault: boolean
  /** Callback when the row checkbox is toggled. */
  onSelect: (id: string, checked: boolean) => void
  /** Callback to set this model as the default. */
  onSetDefault: (id: string) => void
  /** Callback to remove default status from this model. */
  onRemoveDefault: (id: string) => void
  /** Whether all row interactions are disabled (e.g., user lacks update permission). */
  isDisabled?: boolean
}>

function buildModelKebabActions(
  modelId: string,
  isDefault: boolean,
  isEnabled: boolean,
  onSetDefault: (id: string) => void,
  onRemoveDefault: (id: string) => void
): KebabAction[] {
  if (!isEnabled) return []
  if (isDefault) {
    return [
      {
        key: 'remove-default',
        title: <IconLabel icon={<RhUiStarIcon />}>Remove default model</IconLabel>,
        onClick: () => onRemoveDefault(modelId),
      },
    ]
  }
  return [
    {
      key: 'set-default',
      title: <IconLabel icon={<RhUiStarIcon />}>Set as default model</IconLabel>,
      onClick: () => onSetDefault(modelId),
    },
  ]
}

export function ModelRow({
  model,
  index,
  isEnabled,
  isDefault,
  isDisabled,
  onSelect,
  onSetDefault,
  onRemoveDefault,
}: ModelRowProps) {
  const kebabActions = isDisabled
    ? []
    : buildModelKebabActions(model.id, isDefault, isEnabled, onSetDefault, onRemoveDefault)
  return (
    <Tr>
      <Td
        select={{
          rowIndex: index,
          onSelect: (_event, isSelecting) => onSelect(model.id, isSelecting),
          isSelected: isEnabled,
          isDisabled,
        }}
      />
      <Td dataLabel="Name">
        <DescriptionList>
          <DescriptionListGroup>
            <DescriptionListTerm>
              <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
                <FlexItem>
                  <Truncate content={model.name} />
                </FlexItem>
                {isDefault && (
                  <FlexItem>
                    <NxLabel color="blue">Default</NxLabel>
                  </FlexItem>
                )}
              </Flex>
            </DescriptionListTerm>
            {model.description && (
              <DescriptionListDescription>
                <Truncate content={model.description} />
              </DescriptionListDescription>
            )}
          </DescriptionListGroup>
        </DescriptionList>
      </Td>
      <Td isActionCell>
        {kebabActions.length > 0 && <NxKebabMenu actions={kebabActions} aria-label={`Actions for ${model.name}`} />}
      </Td>
    </Tr>
  )
}
