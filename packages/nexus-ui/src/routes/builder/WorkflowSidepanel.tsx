import type { WorkflowAPI } from '@ansible/nexus-contracts'
import {
  Button,
  CompassPanel,
  Flex,
  FlexItem,
  Icon,
  TextArea,
  TextInput,
  Title,
  TitleSizes,
} from '@patternfly/react-core'
import { FileCodeIcon, TimesIcon } from '@patternfly/react-icons'

import { CodeBlock } from '../../components/details/CodeBlock'
import { Detail } from '../../components/details/Detail'
import { Details } from '../../components/details/Details'

type WorkflowWithVersion = WorkflowAPI.components['schemas']['WorkflowWithVersion']

interface WorkflowSidepanelProps {
  workflow: WorkflowWithVersion
  workflowName: string
  workflowDescription: string
  onNameChange: (name: string) => void
  onDescriptionChange: (description: string) => void
  onClose: () => void
}

export function WorkflowSidepanel(props: WorkflowSidepanelProps) {
  return (
    <CompassPanel
      style={{
        height: '100%',
        maxHeight: '100%',
        width: '32rem',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div style={{ flexShrink: 0, padding: 'var(--pf-t--global--spacer--lg)' }}>
        <Flex alignItems={{ default: 'alignItemsCenter' }} justifyContent={{ default: 'justifyContentSpaceBetween' }}>
          <FlexItem>
            <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
              <Icon>
                <FileCodeIcon />
              </Icon>
              <Title headingLevel="h2" size={TitleSizes.lg}>
                Workflow Details
              </Title>
            </Flex>
          </FlexItem>
          <FlexItem>
            <Button variant="plain" onClick={props.onClose} aria-label="Close">
              <Icon>
                <TimesIcon />
              </Icon>
            </Button>
          </FlexItem>
        </Flex>
      </div>
      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          paddingLeft: 'var(--pf-t--global--spacer--lg)',
          paddingRight: 'var(--pf-t--global--spacer--lg)',
          paddingBottom: 'var(--pf-t--global--spacer--lg)',
        }}
      >
        <Details>
          <Detail label="Workflow Name">
            <TextInput
              id="workflow-sidepanel-name"
              type="text"
              value={props.workflowName}
              onChange={(_event, value) => props.onNameChange(value)}
              aria-label="Workflow Name"
            />
          </Detail>
          <Detail label="Description">
            <TextArea
              value={props.workflowDescription}
              onChange={(_event, value) => props.onDescriptionChange(value)}
              rows={3}
              aria-label="Description"
            />
          </Detail>
          {props.workflow.version?.workflow_definition && (
            <Detail label="Workflow Definition">
              <CodeBlock jsonObject={props.workflow.version.workflow_definition} noMaxHeight />
            </Detail>
          )}
        </Details>
      </div>
    </CompassPanel>
  )
}
