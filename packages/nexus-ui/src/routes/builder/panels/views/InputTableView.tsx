import { Table, Thead, Tr, Th, Tbody, Td } from '@patternfly/react-table'
import { useCallback, useMemo } from 'react'

export interface InputTableViewProps {
  data: Record<string, unknown> | Record<string, unknown>[] | null
}

function toSafeString(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return '[Array]'
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  return JSON.stringify(value)
}

function buildRowKey(row: Record<string, unknown>, columns: string[]): string {
  return columns.map((col) => toSafeString(row[col])).join('|')
}

export function InputTableView({ data }: Readonly<InputTableViewProps>) {
  const { columns, rows } = useMemo(() => {
    if (!data) return { columns: [] as string[], rows: [] as Record<string, unknown>[] }

    const rowArray = Array.isArray(data) ? data : [data]
    const columnSet = new Set<string>()
    for (const row of rowArray) {
      for (const key of Object.keys(row)) {
        columnSet.add(key)
      }
    }

    return { columns: [...columnSet], rows: rowArray }
  }, [data])

  const getRowKey = useCallback(
    (row: Record<string, unknown>, rowIndex: number) => {
      const contentKey = buildRowKey(row, columns)
      return contentKey || `row-${String(rowIndex)}`
    },
    [columns]
  )

  return (
    <Table aria-label="Input data" variant="compact">
      <Thead>
        <Tr>
          {columns.map((col) => (
            <Th key={col}>{col}</Th>
          ))}
        </Tr>
      </Thead>
      <Tbody>
        {rows.map((row, rowIndex) => (
          <Tr key={getRowKey(row, rowIndex)}>
            {columns.map((col) => (
              <Td key={col} dataLabel={col}>
                {toSafeString(row[col])}
              </Td>
            ))}
          </Tr>
        ))}
      </Tbody>
    </Table>
  )
}
