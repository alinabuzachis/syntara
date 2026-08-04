/** Map a schema type string to a short display label for the grey pill badges. */
export function getTypeLabel(type: string): string {
  switch (type) {
    case 'string':
      return 'T'
    case 'number':
    case 'integer':
      return '#'
    case 'boolean':
      return '\u2713'
    case 'object':
      return '{}'
    case 'array':
      return '[]'
    default:
      return '?'
  }
}

/** Derive a type label from a runtime JavaScript value. */
export function getTypeLabelFromValue(value: unknown): string {
  if (typeof value === 'string') return getTypeLabel('string')
  if (typeof value === 'number') return getTypeLabel('number')
  if (typeof value === 'boolean') return getTypeLabel('boolean')
  if (Array.isArray(value)) return getTypeLabel('array')
  if (typeof value === 'object' && value !== null) return getTypeLabel('object')
  return getTypeLabel('unknown')
}
