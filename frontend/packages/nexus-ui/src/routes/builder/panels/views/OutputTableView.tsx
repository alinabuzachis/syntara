import { useCallback } from 'react'

import { isUrlValue } from '../utils/treeHelpers'

import { DataTableView, type DataTableViewProps } from './DataTableView'

export type OutputTableViewProps = Omit<DataTableViewProps, 'ariaLabel' | 'renderCell'>

export function OutputTableView(props: Readonly<OutputTableViewProps>) {
  const renderCell = useCallback((text: string) => {
    if (isUrlValue(text)) {
      return (
        <a href={text} target="_blank" rel="noopener noreferrer">
          {text}
        </a>
      )
    }
    return text
  }, [])

  return <DataTableView {...props} ariaLabel="Output data" renderCell={renderCell} />
}
