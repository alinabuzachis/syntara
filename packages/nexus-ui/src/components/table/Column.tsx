export interface Column<T> {
  id: keyof T
  label: string
  render: (item: T) => React.ReactNode
  width?: string // CSS width value (e.g., '100px', '10%', 'auto')
}
