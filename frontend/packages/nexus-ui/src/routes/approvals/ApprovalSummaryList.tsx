import {
  Button,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
} from '@patternfly/react-core'

type ApprovalSummaryListProps = {
  workflowLink?: string
  workflowName: string
  approvalInitiated: string
  onWorkflowClick?: (link: string) => void
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
          Approval Node {/** TODO: make this use real type when we have multiple types implemented */}
        </DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Workflow</DescriptionListTerm>
        <DescriptionListDescription>
          {props.workflowLink && props.onWorkflowClick ? (
            <Button
              variant="link"
              isInline
              onClick={() => props.onWorkflowClick!(props.workflowLink!)}
              style={{ paddingLeft: 0 }}
            >
              {props.workflowName}
            </Button>
          ) : (
            props.workflowName
          )}
        </DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Approval initiated</DescriptionListTerm>
        <DescriptionListDescription>{props.approvalInitiated}</DescriptionListDescription>
      </DescriptionListGroup>
    </DescriptionList>
  )
}
