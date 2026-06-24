import type { WorkflowAPI } from '@ansible/nexus-contracts'
import {
  Button,
  Content,
  ContentVariants,
  Divider,
  Dropdown,
  DropdownGroup,
  DropdownItem,
  DropdownList,
  Flex,
  FlexItem,
  Icon,
  MenuToggle,
  type MenuToggleElement,
  SimpleList,
  SimpleListGroup,
  SimpleListItem,
  Stack,
  StackItem,
  Title,
  TitleSizes,
  Tooltip,
} from '@patternfly/react-core'
import {
  RhUiClockIcon,
  RhUiEllipsisVerticalFillIcon,
  RhUiExportIcon,
  RhUiExternalLinkIcon,
  RhUiMinusIcon,
  RhUiPublishIcon,
  RhUiUndoIcon,
} from '@patternfly/react-icons'
import { useMemo, useState, type ReactNode, type Ref } from 'react'

import { AppRoute } from '../../app/AppRoute'
import { MultiSelectFilter } from '../../components/filters/MultiSelectFilter'
import pageMainSlotStyles from '../../components/layout/NxPage.module.css'
import { NxPanel } from '../../components/layout/NxPanel'
import { NxEmptyStateFilter } from '../../components/states/NxEmptyStateFilter'
import { Link } from '../../hooks/routing/Link'
import type { FilterConfig } from '../../types/filters'

import { formatHistoryDateTime, getDateGroupLabel } from './historyDateUtils'
import { isVersionStatus } from './hooks/useVersionHistory'
import styles from './VersionHistoryPanel.module.css'
import { VersionStatusBadge, type VersionStatus } from './VersionStatusBadge'

type WorkflowVersionBase = WorkflowAPI.components['schemas']['WorkflowVersionResponse']
type WorkflowVersion = WorkflowVersionBase & { created_by_username?: string }

type VersionGroup = {
  label: string
  items: WorkflowVersion[]
}

function groupVersionsByDate(versions: WorkflowVersion[]): VersionGroup[] {
  const map = new Map<string, WorkflowVersion[]>()
  for (const version of versions) {
    const label = version.created_at ? getDateGroupLabel(version.created_at) : 'Unknown'
    if (!map.has(label)) map.set(label, [])
    map.get(label)!.push(version)
  }
  return Array.from(map.entries()).map(([label, items]) => ({ label, items }))
}

type VersionKebabToggleProps = Readonly<{
  toggleRef: Ref<MenuToggleElement>
  isOpen: boolean
  onToggle: () => void
  ariaLabel: string
}>

function VersionKebabToggle({ toggleRef, isOpen, onToggle, ariaLabel }: VersionKebabToggleProps) {
  return (
    <MenuToggle
      ref={toggleRef}
      variant="plain"
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      isExpanded={isOpen}
      aria-label={ariaLabel}
    >
      <RhUiEllipsisVerticalFillIcon />
    </MenuToggle>
  )
}

type VersionRowProps = Readonly<{
  version: WorkflowVersion
  onSelect: () => void
  onRestore: () => void
  onExport: () => void
  onOpenInNewWindow: () => void
  onPublish: () => void
  isSelected?: boolean
  isKebabOpen: boolean
  onKebabToggle: () => void
  onKebabClose: () => void
  canEdit?: boolean
  editTooltip?: string
}>

function VersionRow({
  version,
  onSelect,
  onRestore,
  onExport,
  onOpenInNewWindow,
  onPublish,
  isSelected,
  isKebabOpen,
  onKebabToggle,
  onKebabClose,
  canEdit = true,
  editTooltip,
}: VersionRowProps) {
  const kebabAriaLabel = `Actions for version ${version.version}`
  let publishTooltip: { content: string } | undefined
  if (!canEdit && editTooltip) {
    publishTooltip = { content: editTooltip }
  } else if (version.status === 'published') {
    publishTooltip = { content: 'This version is already published' }
  }
  const renderKebabToggle = (toggleRef: Ref<MenuToggleElement>) => (
    <VersionKebabToggle
      toggleRef={toggleRef}
      isOpen={isKebabOpen}
      onToggle={onKebabToggle}
      ariaLabel={kebabAriaLabel}
    />
  )

  return (
    <SimpleListItem itemId={version.id} isActive={isSelected} onClick={onSelect}>
      <Stack className={styles.versionRowStack}>
        <Flex
          justifyContent={{ default: 'justifyContentSpaceBetween' }}
          alignItems={{ default: 'alignItemsCenter' }}
          flexWrap={{ default: 'nowrap' }}
          fullWidth={{ default: 'fullWidth' }}
        >
          <FlexItem style={{ minWidth: 0 }}>
            <Tooltip
              content={version.publish_name || (version.created_at ? formatHistoryDateTime(version.created_at) : '')}
            >
              <Content component={ContentVariants.p} className={styles.versionTimestamp}>
                {version.publish_name || (version.created_at ? formatHistoryDateTime(version.created_at) : '')}
              </Content>
            </Tooltip>
            {version.publish_name && version.created_at && (
              <Content component={ContentVariants.small}>{formatHistoryDateTime(version.created_at)}</Content>
            )}
          </FlexItem>
          <Flex
            alignItems={{ default: 'alignItemsCenter' }}
            flexWrap={{ default: 'nowrap' }}
            gap={{ default: 'gapSm' }}
          >
            {version.status && isVersionStatus(version.status) && (
              <FlexItem className={styles.kebabFlexItem}>
                <VersionStatusBadge status={version.status} />
              </FlexItem>
            )}
            <FlexItem className={styles.kebabFlexItem} onClick={(e) => e.stopPropagation()}>
              <Dropdown
                isOpen={isKebabOpen}
                onSelect={onKebabClose}
                onOpenChange={(open) => {
                  if (!open) onKebabClose()
                }}
                toggle={renderKebabToggle}
                popperProps={{ position: 'end' }}
              >
                <DropdownGroup label="Views">
                  <DropdownList>
                    <DropdownItem
                      key="open-new-window"
                      onClick={() => onOpenInNewWindow()}
                      icon={<RhUiExternalLinkIcon />}
                    >
                      Open version in new window
                    </DropdownItem>
                  </DropdownList>
                </DropdownGroup>
                <Divider />
                <DropdownGroup label="Actions">
                  <DropdownList>
                    <DropdownItem
                      key="restore"
                      onClick={() => onRestore()}
                      icon={<RhUiUndoIcon />}
                      isAriaDisabled={!canEdit}
                      tooltipProps={!canEdit && editTooltip ? { content: editTooltip } : undefined}
                    >
                      Restore version
                    </DropdownItem>
                    <DropdownItem key="export" onClick={() => onExport()} icon={<RhUiExportIcon />}>
                      Export workflow
                    </DropdownItem>
                    <DropdownItem
                      key="publish"
                      onClick={() => onPublish()}
                      icon={<RhUiPublishIcon />}
                      isAriaDisabled={!canEdit || version.status === 'published'}
                      tooltipProps={publishTooltip}
                    >
                      Publish this version
                    </DropdownItem>
                  </DropdownList>
                </DropdownGroup>
              </Dropdown>
            </FlexItem>
          </Flex>
        </Flex>
        {version.created_by_username && (
          <Link
            href={AppRoute.AccessManagement.UserDetail.replace(':userId', version.created_by)}
            className={styles.usernameLink}
            onClick={(e) => e.stopPropagation()}
          >
            {version.created_by_username}
          </Link>
        )}
      </Stack>
    </SimpleListItem>
  )
}

type VersionHistoryPanelProps = Readonly<{
  versions: WorkflowVersion[]
  onClose: () => void
  onSelectVersion: (version: number) => void
  onRestoreVersion: (version: number, createdAt: string) => void
  onExportVersion: (version: number) => void
  onOpenInNewWindow: (version: number) => void
  onPublishVersion: (version: number) => void
  statusFilter: VersionStatus[]
  onStatusFilterChange: (statuses: VersionStatus[]) => void
  selectedVersion?: number | null
  canEdit?: boolean
  editTooltip?: string
}>

const STATUS_FILTER_OPTIONS: { label: string; value: string }[] = [
  { label: 'Draft', value: 'draft' },
  { label: 'Published', value: 'published' },
  { label: 'Prev. published', value: 'previously_published' },
]

export function VersionHistoryPanel(props: VersionHistoryPanelProps) {
  const {
    versions,
    onClose,
    onSelectVersion,
    onRestoreVersion,
    onExportVersion,
    onOpenInNewWindow,
    onPublishVersion,
    statusFilter,
    onStatusFilterChange,
    selectedVersion,
    canEdit = true,
    editTooltip,
  } = props

  const groups = useMemo(() => groupVersionsByDate(versions), [versions])
  const [openKebabVersionId, setOpenKebabVersionId] = useState<string | null>(null)

  let listBody: ReactNode
  if (versions.length === 0 && statusFilter.length > 0) {
    listBody = <NxEmptyStateFilter clearAllFilters={() => onStatusFilterChange([])} />
  } else if (versions.length === 0) {
    listBody = (
      <Content component={ContentVariants.p} className={styles.emptyStateText}>
        No version history available
      </Content>
    )
  } else {
    listBody = (
      <SimpleList isControlled={false} aria-label="Version history list" className={styles.simpleList}>
        {groups.map(({ label, items }) => (
          <SimpleListGroup
            key={label}
            title={
              <Content component={ContentVariants.small} className={styles.groupTitle}>
                {label}
              </Content>
            }
          >
            {items.flatMap((version) => [
              <VersionRow
                key={version.id}
                version={version}
                onSelect={() => onSelectVersion(version.version)}
                onRestore={() => onRestoreVersion(version.version, version.created_at)}
                onExport={() => onExportVersion(version.version)}
                onOpenInNewWindow={() => onOpenInNewWindow(version.version)}
                onPublish={() => onPublishVersion(version.version)}
                isSelected={selectedVersion === version.version}
                isKebabOpen={openKebabVersionId === version.id}
                onKebabToggle={() => setOpenKebabVersionId(openKebabVersionId === version.id ? null : version.id)}
                onKebabClose={() => setOpenKebabVersionId(null)}
                canEdit={canEdit}
                editTooltip={editTooltip}
              />,
              <Divider key={`${version.id}-divider`} component="li" />,
            ])}
          </SimpleListGroup>
        ))}
      </SimpleList>
    )
  }

  return (
    <NxPanel hasNoPadding isFullHeight className={styles.panelRoot}>
      <div className={styles.panelInner}>
        <Stack className={styles.panelStack}>
          <StackItem className={styles.panelHeader}>
            <Flex
              justifyContent={{ default: 'justifyContentSpaceBetween' }}
              alignItems={{ default: 'alignItemsFlexStart' }}
            >
              <FlexItem>
                <Stack hasGutter>
                  <Flex gap={{ default: 'gapSm' }} alignItems={{ default: 'alignItemsCenter' }}>
                    <Icon>
                      <RhUiClockIcon />
                    </Icon>
                    <Title headingLevel="h2" size={TitleSizes.md}>
                      Version history
                    </Title>
                  </Flex>
                  <Content component={ContentVariants.small}>Browse past saves and publishes.</Content>
                </Stack>
              </FlexItem>
              <FlexItem>
                <Button variant="plain" onClick={onClose} aria-label="Collapse version history">
                  <Icon>
                    <RhUiMinusIcon />
                  </Icon>
                </Button>
              </FlexItem>
            </Flex>
          </StackItem>

          {(versions.length > 0 || statusFilter.length > 0) && (
            <StackItem className={styles.filterSection}>
              <MultiSelectFilter
                fieldKey="status"
                label="State"
                options={STATUS_FILTER_OPTIONS}
                selectedValues={statusFilter}
                placeholder="Filter by state"
                onChange={(filter: FilterConfig | null) => {
                  onStatusFilterChange(filter ? (filter.value as VersionStatus[]) : [])
                }}
              />
            </StackItem>
          )}

          <StackItem isFilled className={`${pageMainSlotStyles.main} ${styles.scrollableBody}`}>
            {listBody}
          </StackItem>
        </Stack>
      </div>
    </NxPanel>
  )
}
