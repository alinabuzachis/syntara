import type { WorkflowAPI } from '@ansible/nexus-contracts'
import {
  Button,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Flex,
  FlexItem,
  Icon,
  Stack,
  StackItem,
  TextArea,
  TextInput,
  Title,
  TitleSizes,
} from '@patternfly/react-core'
import { RhUiCodeIcon, RhUiCloseIcon } from '@patternfly/react-icons'

import { NxCodeBlock } from '../../components/details/NxCodeBlock'
import { NxPanel } from '../../components/layout/NxPanel'

type WorkflowWithVersion = WorkflowAPI.components['schemas']['WorkflowReadWithVersion']

type WorkflowSidepanelProps = {
  workflow: WorkflowWithVersion
  workflowName: string
  workflowDescription: string
  onNameChange: (name: string) => void
  onDescriptionChange: (description: string) => void
  onClose: () => void
}

export function WorkflowSidepanel(props: WorkflowSidepanelProps) {
  return (
    <NxPanel style={{ width: '32rem' }} isFullHeight isScrollable>
      <Stack hasGutter>
        <StackItem>
          <Flex alignItems={{ default: 'alignItemsCenter' }} justifyContent={{ default: 'justifyContentSpaceBetween' }}>
            <FlexItem>
              <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
                <Icon>
                  <RhUiCodeIcon />
                </Icon>
                <Title headingLevel="h2" size={TitleSizes.lg}>
                  Workflow details
                </Title>
              </Flex>
            </FlexItem>
            <FlexItem>
              <Button variant="plain" onClick={props.onClose} aria-label="Close">
                <Icon>
                  <RhUiCloseIcon />
                </Icon>
              </Button>
            </FlexItem>
          </Flex>
        </StackItem>
        <StackItem>
          <DescriptionList>
            <DescriptionListGroup>
              <DescriptionListTerm>Workflow name</DescriptionListTerm>
              <DescriptionListDescription>
                <TextInput
                  id="workflow-sidepanel-name"
                  type="text"
                  value={props.workflowName}
                  onChange={(_event, value) => props.onNameChange(value)}
                  aria-label="Workflow name in workflow details"
                />
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Description</DescriptionListTerm>
              <DescriptionListDescription>
                <TextArea
                  value={props.workflowDescription}
                  onChange={(_event, value) => props.onDescriptionChange(value)}
                  rows={3}
                  aria-label="Description"
                />
              </DescriptionListDescription>
            </DescriptionListGroup>
            {props.workflow.version?.workflow_definition && (
              <DescriptionListGroup>
                <DescriptionListTerm>Workflow definition</DescriptionListTerm>
                <DescriptionListDescription>
                  <NxCodeBlock jsonObject={props.workflow.version.workflow_definition} noMaxHeight />
                </DescriptionListDescription>
              </DescriptionListGroup>
            )}
          </DescriptionList>
        </StackItem>
      </Stack>
    </NxPanel>
  )
}
