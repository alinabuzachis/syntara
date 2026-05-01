import type { Approval } from '@ansible/nexus-contracts'
import { Modal, ModalBody, ModalHeader } from '@patternfly/react-core'

import { ApprovalReviewView } from '../../executions/ApprovalReviewView'

type ApprovalReviewModalProps = Readonly<{
  approval: Approval | null
  isOpen: boolean
  activityNameMap?: Map<string, string>
  onClose: () => void
}>

export function ApprovalReviewModal({ approval, isOpen, activityNameMap, onClose }: ApprovalReviewModalProps) {
  return (
    <Modal isOpen={isOpen && !!approval} onClose={onClose} variant="large" aria-label="Review approval">
      <ModalHeader title="Review approval" />
      <ModalBody>
        {approval && <ApprovalReviewView approval={approval} activityNameMap={activityNameMap} onClose={onClose} />}
      </ModalBody>
    </Modal>
  )
}
