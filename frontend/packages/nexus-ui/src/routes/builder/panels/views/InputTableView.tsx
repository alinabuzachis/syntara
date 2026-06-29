import { useCallback } from 'react'

import { highlightText } from '../../../../utils/highlightText'
import { isUrlValue } from '../utils/treeHelpers'

import { DataTableView, type DataTableViewProps } from './DataTableView'

export type InputTableViewProps = Omit<DataTableViewProps, 'ariaLabel' | 'renderCell' | 'renderHeader'> & {
  searchTerm?: string
}

export function InputTableView({ searchTerm, ...props }: Readonly<InputTableViewProps>) {
  const renderCell = useCallback(
    (text: string) => {
      const content = searchTerm ? highlightText(text, searchTerm) : text
      if (isUrlValue(text)) {
        return (
          <a href={text} target="_blank" rel="noopener noreferrer">
            {content}
          </a>
        )
      }
      return content
    },
    [searchTerm]
  )
  const renderHeader = useCallback(
    (text: string) => (searchTerm ? highlightText(text, searchTerm) : text),
    [searchTerm]
  )

  return (
    <DataTableView
      {...props}
      ariaLabel="Input data"
      renderCell={renderCell}
      renderHeader={searchTerm ? renderHeader : undefined}
    />
  )
}
