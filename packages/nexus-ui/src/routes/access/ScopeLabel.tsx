import { Button, Flex, FlexItem, Label, LabelGroup, Stack, StackItem } from '@patternfly/react-core'
import { RhUiLockIcon } from '@patternfly/react-icons'
import { navigate } from 'wouter/use-browser-location'

import { AppRoute } from '../../app/AppRoute'

import type { PolicyStatement } from './types'

const SCOPE_DISPLAY: Record<string, { label: string; color: 'blue' | 'green' | 'teal' }> = {
  system: { label: 'System', color: 'blue' },
  any: { label: 'Any', color: 'blue' },
  self: { label: 'Self', color: 'teal' },
  project: { label: 'Project', color: 'green' },
}

type ScopeLabelProps = {
  scope?: string | null
}

export function ScopeLabel({ scope }: Readonly<ScopeLabelProps>) {
  const display = SCOPE_DISPLAY[scope ?? ''] ?? SCOPE_DISPLAY.system

  return (
    <Label color={display.color} isCompact>
      {display.label}
    </Label>
  )
}

type PolicyTypeLabelProps = {
  isBuiltin?: boolean
}

export function PolicyTypeLabel({ isBuiltin }: Readonly<PolicyTypeLabelProps>) {
  if (isBuiltin) {
    return (
      <Label color="grey" icon={<RhUiLockIcon />} isCompact>
        Built-in
      </Label>
    )
  }
  return (
    <Label color="blue" isCompact>
      Custom
    </Label>
  )
}

type ProjectLabelProps = {
  projectId?: string | null
  projectNameMap: Map<string, string>
}

export function ProjectLabel({ projectId, projectNameMap }: Readonly<ProjectLabelProps>) {
  if (!projectId) {
    return <>-</>
  }

  const projectUrl = AppRoute.AccessManagement.ProjectDetail.replace(':projectId', projectId)

  return (
    <Button
      variant="link"
      isInline
      onClick={(e) => {
        e.stopPropagation()
        navigate(projectUrl)
      }}
    >
      {projectNameMap.get(projectId) ?? projectId}
    </Button>
  )
}

type StatementsCellProps = {
  statements: PolicyStatement[]
}

export function StatementsCell({ statements }: Readonly<StatementsCellProps>) {
  if (statements.length === 0) {
    return <>—</>
  }

  return (
    <Stack hasGutter>
      {statements.map((stmt) => (
        <StackItem key={`${stmt.effect}-${stmt.scope}-${stmt.actions.join('-')}`}>
          <Flex gap={{ default: 'gapXs' }} alignItems={{ default: 'alignItemsCenter' }} flexWrap={{ default: 'wrap' }}>
            <FlexItem>
              <Label color={stmt.effect === 'allow' ? 'green' : 'red'} isCompact>
                {stmt.effect === 'allow' ? 'Allow' : 'Deny'}
              </Label>
            </FlexItem>
            <FlexItem>
              <Label color="grey" isCompact>
                scope: {stmt.scope}
              </Label>
            </FlexItem>
            <FlexItem>
              <LabelGroup isCompact numLabels={2}>
                {stmt.actions.map((action) => (
                  <Label key={action} color="grey" isCompact>
                    {action}
                  </Label>
                ))}
              </LabelGroup>
            </FlexItem>
          </Flex>
        </StackItem>
      ))}
    </Stack>
  )
}
