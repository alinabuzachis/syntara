import {
  CodeBlock as PFCodeBlock,
  CodeBlockCode,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
} from '@patternfly/react-core'
import type { Node } from '@xyflow/react'

import { NxCodeBlock } from '../../components/details/NxCodeBlock'
import type { NodeType } from '../workflows/canvas/nodes/NodeType'

type NodeRawDataViewProps = {
  node: Node<NodeType['data']>
}

export function NodeRawDataView({ node }: NodeRawDataViewProps) {
  return (
    <DescriptionList>
      <DescriptionListGroup>
        <DescriptionListTerm>Node Type</DescriptionListTerm>
        <DescriptionListDescription>{node.type}</DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Node ID</DescriptionListTerm>
        <DescriptionListDescription>
          <PFCodeBlock>
            <CodeBlockCode>{node.id}</CodeBlockCode>
          </PFCodeBlock>
        </DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Node Data</DescriptionListTerm>
        <DescriptionListDescription>
          <NxCodeBlock jsonObject={node.data} />
        </DescriptionListDescription>
      </DescriptionListGroup>
    </DescriptionList>
  )
}
