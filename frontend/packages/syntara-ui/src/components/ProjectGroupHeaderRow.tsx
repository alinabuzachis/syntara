import { Flex, FlexItem } from '@patternfly/react-core'
import { RhUiCaretDownIcon, RhUiCaretRightIcon } from '@patternfly/react-icons'
import { Td, Tr } from '@patternfly/react-table'

import groupedTableStyles from './groupedTable.module.css'

type ProjectGroupHeaderRowProps = {
  projectId: string
  projectName: string | undefined
  isCollapsed: boolean
  colSpan: number
  onToggle: () => void
}

export function ProjectGroupHeaderRow({
  projectId,
  projectName,
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
        </Flex>
      </Td>
    </Tr>
  )
}
