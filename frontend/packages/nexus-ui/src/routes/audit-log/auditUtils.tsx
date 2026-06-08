import type { AuditAPI } from '@ansible/nexus-contracts'
import {
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Label,
} from '@patternfly/react-core'
import {
  RhUiCheckCircleFillIcon,
  RhUiErrorFillIcon,
  RhUiInformationFillIcon,
  RhUiWarningFillIcon,
} from '@patternfly/react-icons'

import { capitalize, formatSnakeCase } from '../../utils/stringUtils'

type AuditEventRead = AuditAPI.components['schemas']['AuditEventRead']

type EventSeverity = AuditAPI.components['schemas']['EventSeverity']
type EventStatus = AuditAPI.components['schemas']['EventStatus']

const auditStatusMap: Record<EventStatus, 'success' | 'danger'> = {
  success: 'success',
  error: 'danger',
}

const auditStatusIcons: Record<EventStatus, React.ComponentType<{ className?: string }>> = {
  success: RhUiCheckCircleFillIcon,
  error: RhUiErrorFillIcon,
}

export function AuditStatusLabel(props: Readonly<{ status: EventStatus }>) {
  const IconComponent = auditStatusIcons[props.status]
  return (
    <Label variant="outline" status={auditStatusMap[props.status]} icon={<IconComponent />}>
      {capitalize(props.status)}
    </Label>
  )
}

const severityMap: Record<EventSeverity, 'info' | 'warning' | 'danger'> = {
  info: 'info',
  warning: 'warning',
  error: 'danger',
  critical: 'danger',
}

const severityIcons: Record<EventSeverity, React.ComponentType<{ className?: string }>> = {
  info: RhUiInformationFillIcon,
  warning: RhUiWarningFillIcon,
  error: RhUiErrorFillIcon,
  critical: RhUiWarningFillIcon,
}

export function AuditSeverityLabel(props: Readonly<{ severity: EventSeverity }>) {
  const IconComponent = severityIcons[props.severity]
  return (
    <Label variant="outline" status={severityMap[props.severity]} icon={<IconComponent />}>
      {capitalize(props.severity)}
    </Label>
  )
}

const TABLE_AND_META_KEYS = new Set([
  'id',
  'created_at',
  'updated_at',
  'labels',
  'event_category',
  'event_severity',
  'event_status',
  'actor_type',
  'actor_username',
  'resource_urn',
  'resource_name',
  'structured_data',
])

function formatScalar(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return JSON.stringify(value)
}

function FieldRow(props: Readonly<{ fieldKey: string; value: unknown }>) {
  if (props.value === undefined || props.value === null) {
    return null
  }
  return (
    <DescriptionListGroup>
      <DescriptionListTerm>{formatSnakeCase(props.fieldKey)}</DescriptionListTerm>
      <DescriptionListDescription>{formatScalar(props.value)}</DescriptionListDescription>
    </DescriptionListGroup>
  )
}

export function AuditEventExpandedContent(props: Readonly<{ event: AuditEventRead }>) {
  const topLevelEntries = Object.entries(props.event).filter(([key]) => !TABLE_AND_META_KEYS.has(key))

  const structuredEntries = props.event.structured_data
    ? Object.entries(props.event.structured_data).filter(([key]) => key !== 'data_type')
    : []

  return (
    <DescriptionList isCompact isHorizontal termWidth="12rem">
      {topLevelEntries.map(([key, value]) => (
        <FieldRow key={key} fieldKey={key} value={value} />
      ))}
      {structuredEntries.map(([key, value]) => (
        <FieldRow key={key} fieldKey={key} value={value} />
      ))}
    </DescriptionList>
  )
}
