import { CodeBlock } from '../../../../../components/details/CodeBlock'
import { Detail } from '../../../../../components/details/Detail'

/**
 * Renders a condition detail if condition exists
 */
export function renderCondition(condition?: string) {
  if (!condition) return null
  return (
    <Detail label="Condition">
      <CodeBlock>{condition}</CodeBlock>
    </Detail>
  )
}

/**
 * Renders outputs as key-value pairs if outputs exist
 */
export function renderOutputs(outputs?: Record<string, unknown>) {
  if (!outputs) return null
  return (
    <Detail label="Outputs">
      <CodeBlock>
        {Object.entries(outputs)
          .map(([key, value]) => `${key}: ${value}`)
          .join('\n')}
      </CodeBlock>
    </Detail>
  )
}

/**
 * Renders inputs as key-value pairs if inputs exist
 */
export function renderInputs(inputs?: Record<string, unknown>) {
  if (!inputs) return null
  return (
    <Detail label="Inputs">
      <CodeBlock>
        {Object.entries(inputs)
          .map(([key, value]) => `${key}: ${value}`)
          .join('\n')}
      </CodeBlock>
    </Detail>
  )
}

/**
 * Renders full JSON representation of data if show is true
 */
export function renderJson(data: unknown, show?: boolean, label = 'JSON') {
  if (!show || data === undefined || data === null) return null
  const jsonObject = typeof data === 'object' ? (data as object) : { value: data }
  return (
    <Detail label={label}>
      <CodeBlock jsonObject={jsonObject} />
    </Detail>
  )
}

/**
 * Renders a generic object as JSON
 */
export function renderObject(label: string, data?: Record<string, unknown>) {
  if (!data) return null
  return (
    <Detail label={label}>
      <CodeBlock jsonObject={data} />
    </Detail>
  )
}

/**
 * Renders a simple text detail
 */
export function renderText(label: string, text?: string) {
  if (text === undefined || text === null || text === '') return null
  return (
    <Detail label={label}>
      <CodeBlock>{text}</CodeBlock>
    </Detail>
  )
}
