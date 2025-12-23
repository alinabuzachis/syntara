import { Content, ContentVariants } from '@patternfly/react-core'

export function DateCell(props: { dateString?: string | null }) {
  if (!props.dateString) {
    return <Content component={ContentVariants.p}>Unknown</Content>
  }
  const date = new Date(props.dateString)
  return (
    <Content component={ContentVariants.p} style={{ whiteSpace: 'nowrap' }}>
      {date.toLocaleDateString()} <span style={{ opacity: 0.6 }}>{date.toLocaleTimeString()}</span>
    </Content>
  )
}
