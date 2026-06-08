import { NxCodeBlock } from '../../../../components/details/NxCodeBlock'

export type InputJsonViewProps = {
  data: Record<string, unknown> | null
}

export function InputJsonView({ data }: Readonly<InputJsonViewProps>) {
  if (!data) {
    return null
  }

  return (
    <section aria-label="JSON input">
      <NxCodeBlock jsonObject={data} enableCopy enableExpand expandTitle="Input JSON" noMaxHeight />
    </section>
  )
}
