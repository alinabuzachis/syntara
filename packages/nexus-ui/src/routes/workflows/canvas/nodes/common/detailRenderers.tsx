import { NxCodeBlock } from '../../../../../components/details/NxCodeBlock'
import { NxDetail } from '../../../../../components/details/NxDetail'

const nodeCodeBlockProps = { noMaxHeight: true }

/**
 * Renders a condition detail if condition exists
 */
export function renderCondition(condition?: string) {
  if (!condition) return null
  return (
    <NxDetail label="Condition">
      <NxCodeBlock {...nodeCodeBlockProps}>{condition}</NxCodeBlock>
    </NxDetail>
  )
}

/**
 * Renders outputs as key-value pairs if outputs exist
 */
export function renderOutputs(outputs?: Record<string, unknown>) {
  if (!outputs) return null
  return (
    <NxDetail label="Outputs">
      <NxCodeBlock {...nodeCodeBlockProps}>
        {Object.entries(outputs)
          .map(([key, value]) => `${key}: ${String(value)}`)
          .join('\n')}
      </NxCodeBlock>
    </NxDetail>
  )
}

/**
 * Renders inputs as key-value pairs if inputs exist
 */
export function renderInputs(inputs?: Record<string, unknown>) {
  if (!inputs) return null
  return (
    <NxDetail label="Inputs">
      <NxCodeBlock {...nodeCodeBlockProps}>
        {Object.entries(inputs)
          .map(([key, value]) => `${key}: ${String(value)}`)
          .join('\n')}
      </NxCodeBlock>
    </NxDetail>
  )
}

/**
 * Renders full JSON representation of data if show is true
 */
export function renderJson(data: unknown, show?: boolean, label = 'JSON') {
  if (!show || data === undefined || data === null) return null
  const jsonObject = typeof data === 'object' ? data : { value: data }
  return (
    <NxDetail label={label}>
      <NxCodeBlock jsonObject={jsonObject} {...nodeCodeBlockProps} />
    </NxDetail>
  )
}

/**
 * Renders a generic object as JSON
 */
export function renderObject(label: string, data?: Record<string, unknown>) {
  if (!data) return null
  return (
    <NxDetail label={label}>
      <NxCodeBlock jsonObject={data} {...nodeCodeBlockProps} />
    </NxDetail>
  )
}

/**
 * Renders a simple text detail
 */
export function renderText(label: string, text?: string) {
  if (text === undefined || text === null || text === '') return null
  return (
    <NxDetail label={label}>
      <NxCodeBlock {...nodeCodeBlockProps}>{text}</NxCodeBlock>
    </NxDetail>
  )
}
