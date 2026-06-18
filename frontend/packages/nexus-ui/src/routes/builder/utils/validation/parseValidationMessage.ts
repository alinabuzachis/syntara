const KEY_PREFIX_PATTERN = /^(\w+(?:\.\w+)*): /
const ERRORS_ARRAY_PATTERN = /}\s*,\s*errors:\[(.+)\]$/
const NODE_NAME_IN_MESSAGE = /'name'\s*:\s*'([^']+)'/

export type ParsedValidationMessage = {
  key: string
  displayKey: string
  messages: string[]
}

export function parseValidationMessage(raw: string): ParsedValidationMessage {
  const keyMatch = KEY_PREFIX_PATTERN.exec(raw)
  if (!keyMatch) {
    return { key: 'Workflow', displayKey: 'Workflow', messages: [raw] }
  }

  const key = keyMatch[1]
  const rest = raw.substring(keyMatch[0].length)

  const nameMatch = NODE_NAME_IN_MESSAGE.exec(rest)
  const displayKey = nameMatch?.[1] ?? key

  const errorsMatch = ERRORS_ARRAY_PATTERN.exec(rest)
  if (errorsMatch) {
    const items = errorsMatch[1].split(/,\s*(?='|[A-Z])/).map((s) => s.trim())
    return { key, displayKey, messages: items }
  }

  return { key, displayKey, messages: [rest] }
}

const ID_PATTERN = /^'([^']+)' does not match '\^/
const REQUIRED_PROPERTY_PATTERN = /^'([^']+)' is a required property$/
const HUMANIZED_MISSING_FIELD = /^Missing required field "([^"]+)"$/

export function humanizeValidationMessage(raw: string): string {
  const idMatch = ID_PATTERN.exec(raw)
  if (idMatch) {
    return `"${idMatch[1]}" is not a valid ID. Use letters, numbers, and underscores only (e.g., "my_node_1")`
  }

  const requiredMatch = REQUIRED_PROPERTY_PATTERN.exec(raw)
  if (requiredMatch) {
    return `Missing required field "${requiredMatch[1]}"`
  }

  return raw
}

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items.join('')
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

export function mergeHumanizedMessages(messages: string[]): string[] {
  const missingFields: string[] = []
  const other: string[] = []

  for (const msg of messages) {
    const match = HUMANIZED_MISSING_FIELD.exec(msg)
    if (match) {
      missingFields.push(`"${match[1]}"`)
    } else {
      other.push(msg)
    }
  }

  const result: string[] = []
  if (missingFields.length === 1) {
    result.push(`Missing required field ${missingFields[0]}`)
  } else if (missingFields.length > 1) {
    result.push(`Missing required fields ${joinWithAnd(missingFields)}`)
  }
  result.push(...other)
  return result
}
