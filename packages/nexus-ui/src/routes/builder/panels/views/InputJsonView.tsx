import { CodeBlock } from '../../../../components/details/CodeBlock'

export interface InputJsonViewProps {
  data: Record<string, unknown> | null
}

export function InputJsonView({ data }: Readonly<InputJsonViewProps>) {
  if (!data) {
    return null
  }

  return (
    <section aria-label="JSON input">
      <CodeBlock jsonObject={data} enableCopy noMaxHeight />
    </section>
  )
}
