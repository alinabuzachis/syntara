import {
  Button,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from '@patternfly/react-core'
import { RhUiErrorIcon } from '@patternfly/react-icons'
import { useMemo, useState } from 'react'

import { useAlerts } from '../../../providers/alerts'
import { getErrorMessage } from '../../../utils/apiErrors'
import { accessClient } from '../../access/accessClient'
import { TypeaheadSelect } from '../../access/TypeaheadSelect'
import { useAllUsers } from '../../access/useAllUsers'
import { userDisplayName } from '../users/userDisplayName'

type AddMemberModalProps = {
  groupId: string
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  existingMemberIds: string[]
}

export function AddMemberModal({
  groupId,
  isOpen,
  onClose,
  onSuccess,
  existingMemberIds,
}: Readonly<AddMemberModalProps>) {
  const [selectedUserId, setSelectedUserId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { showAlert } = useAlerts()

  const { users: allUsers } = useAllUsers()

  const availableUsers = useMemo(() => {
    return allUsers
      .filter((u) => !existingMemberIds.includes(u.id))
      .map((u) => ({
        value: u.id,
        label: u.username,
        description: userDisplayName(u) || undefined,
      }))
  }, [allUsers, existingMemberIds])

  const { mutate: addMember, isPending } = accessClient.useMutation('post', '/groups/{group_id}/members')

  const handleClose = () => {
    setSelectedUserId('')
    setError(null)
    onClose()
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUserId) {
      setError('Please select a user')
      return
    }

    addMember(
      {
        params: { path: { group_id: groupId } },
        body: { user_id: selectedUserId },
      },
      {
        onSuccess: () => {
          const user = availableUsers.find((u) => u.value === selectedUserId)
          showAlert({
            title: 'Member added',
            description: `User "${user?.label ?? selectedUserId}" has been added to the group.`,
            variant: 'success',
            autoDismiss: true,
          })
          handleClose()
          onSuccess()
        },
        onError: (err: unknown) => {
          showAlert({
            title: 'Failed to add member',
            description: getErrorMessage(err),
            variant: 'error',
            autoDismiss: true,
          })
        },
      }
    )
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} variant="medium">
      <ModalHeader title="Add member" />
      <ModalBody>
        <Form id="add-member-form" onSubmit={handleSubmit}>
          <FormGroup label="User" fieldId="add-member-user" isRequired>
            <TypeaheadSelect
              id="add-member-user"
              ariaLabel="Select a user"
              options={availableUsers}
              selected={selectedUserId}
              onChange={(value) => {
                setSelectedUserId(value)
                setError(null)
              }}
              placeholder="Search for a user..."
              hasError={!!error}
            />
            {error && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                    {error}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" type="submit" form="add-member-form" isDisabled={isPending} isLoading={isPending}>
          Add
        </Button>
        <Button variant="link" onClick={handleClose} isDisabled={isPending}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}
