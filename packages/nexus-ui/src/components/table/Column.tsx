export interface Column<T> {
  id: keyof T
  label: string
  render: (item: T) => React.ReactNode
}
