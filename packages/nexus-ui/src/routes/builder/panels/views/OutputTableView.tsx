import { DataTableView, type DataTableViewProps } from './DataTableView'

export type OutputTableViewProps = Omit<DataTableViewProps, 'ariaLabel'>

export function OutputTableView(props: Readonly<OutputTableViewProps>) {
  return <DataTableView {...props} ariaLabel="Output data" />
}
