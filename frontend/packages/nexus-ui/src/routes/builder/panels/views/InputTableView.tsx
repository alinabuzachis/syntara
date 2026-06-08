import { useCallback } from 'react'

import { highlightText } from '../../../../utils/highlightText'

import { DataTableView, type DataTableViewProps } from './DataTableView'

export type InputTableViewProps = Omit<DataTableViewProps, 'ariaLabel' | 'renderCell' | 'renderHeader'> & {
  searchTerm?: string
}

export function InputTableView({ searchTerm, ...props }: Readonly<InputTableViewProps>) {
  const renderCell = useCallback((text: string) => (searchTerm ? highlightText(text, searchTerm) : text), [searchTerm])
  const renderHeader = useCallback(
    (text: string) => (searchTerm ? highlightText(text, searchTerm) : text),
    [searchTerm]
  )

  return (
    <DataTableView
      {...props}
      ariaLabel="Input data"
      renderCell={searchTerm ? renderCell : undefined}
      renderHeader={searchTerm ? renderHeader : undefined}
    />
  )
}
