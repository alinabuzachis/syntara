import {
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
} from '@patternfly/react-core'

type ApprovalSummaryListProps = {
  workflowName: string
  approvalInitiated: string
}

export function ApprovalSummaryList(props: ApprovalSummaryListProps) {
  return (
    <DescriptionList
      isAutoColumnWidths
      columnModifier={{ default: '3Col' }}
      style={{ justifyContent: 'space-between' }}
    >
      <DescriptionListGroup>
        <DescriptionListTerm>Approval type</DescriptionListTerm>
        <DescriptionListDescription>
          Approval step {/** display of step type is hardcoded; multiple approval types are not yet implemented */}
        </DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Workflow</DescriptionListTerm>
        <DescriptionListDescription>{props.workflowName}</DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Approval initiated</DescriptionListTerm>
        <DescriptionListDescription>{props.approvalInitiated}</DescriptionListDescription>
      </DescriptionListGroup>
    </DescriptionList>
  )
}
