import { DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from '@patternfly/react-core'

export function Detail(props: { label: string; children?: React.ReactNode }) {
  if (!props.children || props.children === null) {
    return null
  }
  return (
    <DescriptionListGroup>
      <DescriptionListTerm>{props.label}</DescriptionListTerm>
      <DescriptionListDescription>{props.children}</DescriptionListDescription>
    </DescriptionListGroup>
  )
}
