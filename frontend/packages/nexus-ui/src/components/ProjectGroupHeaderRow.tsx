import { Flex, FlexItem } from '@patternfly/react-core'
import { RhUiCaretDownIcon, RhUiCaretRightIcon } from '@patternfly/react-icons'
import { Td, Tr } from '@patternfly/react-table'

import groupedTableStyles from './groupedTable.module.css'
import { NxLabel } from './labels/NxLabel'

type ProjectGroupHeaderRowProps = {
  projectId: string
  projectName: string | undefined
  itemCount: number
  isCollapsed: boolean
  colSpan: number
  onToggle: () => void
}

export function ProjectGroupHeaderRow({
  projectId,
  projectName,
  itemCount,
  isCollapsed,
  colSpan,
  onToggle,
}: Readonly<ProjectGroupHeaderRowProps>) {
  return (
    <Tr className={groupedTableStyles.groupHeader} onClick={onToggle}>
      <Td colSpan={colSpan}>
        <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
          <FlexItem>{isCollapsed ? <RhUiCaretRightIcon /> : <RhUiCaretDownIcon />}</FlexItem>
          <FlexItem>
            <strong>{projectName ?? (projectId === 'unknown' ? 'No project' : projectId)}</strong>
          </FlexItem>
          <FlexItem>
            <NxLabel color="purple">{itemCount}</NxLabel>
          </FlexItem>
        </Flex>
      </Td>
    </Tr>
  )
}
