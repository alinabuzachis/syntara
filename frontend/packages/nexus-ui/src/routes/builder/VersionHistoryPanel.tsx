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
  RhUiDuplicateIcon,
  RhUiEditIcon,
  RhUiEllipsisVerticalFillIcon,
  RhUiExportIcon,
  RhUiExternalLinkIcon,
  RhUiHistoryIcon,
  RhUiMinusIcon,
  RhUiPublishIcon,
  RhUiUndoIcon,
} from '@patternfly/react-icons'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react'

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

type WorkflowVersion = WorkflowAPI.components['schemas']['WorkflowVersionRead']

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

type VersionKebabMenuProps = Readonly<{
  version: WorkflowVersion
  isOpen: boolean
  onToggle: () => void
  onClose: () => void
  onRestore: () => void
  onExport: () => void
  onOpenInNewWindow: () => void
  onPublish: () => void
  onViewRunHistory: () => void
  hasRunHistory: boolean
  onEdit: () => void
  onDuplicate: () => void
  canEdit: boolean
  editTooltip?: string
}>

function VersionKebabMenu({
  version,
  isOpen,
  onToggle,
  onClose,
  onRestore,
  onExport,
  onOpenInNewWindow,
  onPublish,
  onViewRunHistory,
  hasRunHistory,
  onEdit,
  onDuplicate,
  canEdit,
  editTooltip,
}: VersionKebabMenuProps) {
  const ariaLabel = `Actions for version ${version.version}`
  const disabledTooltip = !canEdit && editTooltip ? { content: editTooltip } : undefined
  const isAlreadyPublished = version.status === 'published'
  const publishTooltip =
    disabledTooltip ?? (isAlreadyPublished ? { content: 'This version is already published' } : undefined)
  const renderToggle = (toggleRef: Ref<MenuToggleElement>) => (
    <VersionKebabToggle toggleRef={toggleRef} isOpen={isOpen} onToggle={onToggle} ariaLabel={ariaLabel} />
  )

  return (
    <Dropdown
      isOpen={isOpen}
      onSelect={onClose}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      toggle={renderToggle}
      popperProps={{ position: 'end' }}
    >
      <DropdownGroup label="Views">
        <DropdownList>
          <DropdownItem key="open-new-window" onClick={() => onOpenInNewWindow()} icon={<RhUiExternalLinkIcon />}>
            Open version in new window
          </DropdownItem>
          <DropdownItem
            key="view-run-history"
            onClick={hasRunHistory ? () => onViewRunHistory() : undefined}
            icon={<RhUiHistoryIcon />}
            isAriaDisabled={!hasRunHistory}
            tooltipProps={!hasRunHistory ? { content: 'No runs for this version' } : undefined}
          >
            View run history of this version
          </DropdownItem>
        </DropdownList>
      </DropdownGroup>
      <Divider />
      <DropdownGroup label="Actions">
        <DropdownList>
          <DropdownItem
            key="restore"
            onClick={canEdit ? () => onRestore() : undefined}
            icon={<RhUiUndoIcon />}
            isAriaDisabled={!canEdit}
            tooltipProps={disabledTooltip}
          >
            Restore version
          </DropdownItem>
          <DropdownItem
            key="edit"
            onClick={canEdit ? () => onEdit() : undefined}
            icon={<RhUiEditIcon />}
            isAriaDisabled={!canEdit}
            tooltipProps={disabledTooltip}
          >
            Edit version name and description
          </DropdownItem>
          <DropdownItem
            key="duplicate"
            onClick={canEdit ? () => onDuplicate() : undefined}
            icon={<RhUiDuplicateIcon />}
            isAriaDisabled={!canEdit}
            tooltipProps={disabledTooltip}
          >
            Duplicate as new workflow
          </DropdownItem>
          <DropdownItem key="export" onClick={() => onExport()} icon={<RhUiExportIcon />}>
            Export workflow
          </DropdownItem>
          <DropdownItem
            key="publish"
            onClick={() => onPublish()}
            icon={<RhUiPublishIcon />}
            isAriaDisabled={!canEdit || isAlreadyPublished}
            tooltipProps={publishTooltip}
          >
            Publish this version
          </DropdownItem>
        </DropdownList>
      </DropdownGroup>
    </Dropdown>
  )
}

type VersionRowProps = Readonly<{
  version: WorkflowVersion
  onSelect: () => void
  onRestore: () => void
  onExport: () => void
  onOpenInNewWindow: () => void
  onPublish: () => void
  onViewRunHistory: () => void
  hasRunHistory: boolean
  onEdit: () => void
  onDuplicate: () => void
  isSelected?: boolean
  isKebabOpen: boolean
  onKebabToggle: () => void
  onKebabClose: () => void
  canEdit?: boolean
  editTooltip?: string
  scrollRef?: Ref<HTMLSpanElement>
}>

function VersionRow({
  version,
  onSelect,
  onRestore,
  onExport,
  onOpenInNewWindow,
  onPublish,
  onViewRunHistory,
  hasRunHistory,
  onEdit,
  onDuplicate,
  isSelected,
  isKebabOpen,
  onKebabToggle,
  onKebabClose,
  canEdit = true,
  editTooltip,
  scrollRef,
}: VersionRowProps) {
  return (
    <SimpleListItem itemId={version.id} isActive={isSelected} onClick={onSelect}>
      <span ref={scrollRef} />
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
              <VersionKebabMenu
                version={version}
                isOpen={isKebabOpen}
                onToggle={onKebabToggle}
                onClose={onKebabClose}
                onRestore={onRestore}
                onExport={onExport}
                onOpenInNewWindow={onOpenInNewWindow}
                onPublish={onPublish}
                onViewRunHistory={onViewRunHistory}
                hasRunHistory={hasRunHistory}
                onEdit={onEdit}
                onDuplicate={onDuplicate}
                canEdit={canEdit}
                editTooltip={editTooltip}
              />
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
  onViewRunHistory: (versionNumber: number) => void
  executedVersionNumbers: Map<number, string>
  onEditVersion: (version: WorkflowVersion) => void
  onDuplicateVersion: (version: WorkflowVersion) => void
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
    onViewRunHistory,
    executedVersionNumbers,
    onEditVersion,
    onDuplicateVersion,
    statusFilter,
    onStatusFilterChange,
    selectedVersion,
    canEdit = true,
    editTooltip,
  } = props

  const groups = useMemo(() => groupVersionsByDate(versions), [versions])
  const [openKebabVersionId, setOpenKebabVersionId] = useState<string | null>(null)

  const selectedRef = useRef<HTMLSpanElement>(null)
  const scrollToSelected = useCallback(() => {
    const li = selectedRef.current?.closest('li')
    li?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, [])
  useEffect(scrollToSelected, [selectedVersion, scrollToSelected])

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
            {items.flatMap((version) => {
              const isActive = selectedVersion === version.version
              return [
                <VersionRow
                  key={version.id}
                  version={version}
                  onSelect={() => onSelectVersion(version.version)}
                  onRestore={() => onRestoreVersion(version.version, version.created_at)}
                  onExport={() => onExportVersion(version.version)}
                  onOpenInNewWindow={() => onOpenInNewWindow(version.version)}
                  onPublish={() => onPublishVersion(version.version)}
                  onViewRunHistory={() => onViewRunHistory(version.version)}
                  hasRunHistory={executedVersionNumbers.has(version.version)}
                  onEdit={() => onEditVersion(version)}
                  onDuplicate={() => onDuplicateVersion(version)}
                  isSelected={isActive}
                  isKebabOpen={openKebabVersionId === version.id}
                  onKebabToggle={() => setOpenKebabVersionId(openKebabVersionId === version.id ? null : version.id)}
                  onKebabClose={() => setOpenKebabVersionId(null)}
                  canEdit={canEdit}
                  editTooltip={editTooltip}
                  scrollRef={isActive ? selectedRef : undefined}
                />,
                <Divider key={`${version.id}-divider`} component="li" />,
              ]
            })}
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
