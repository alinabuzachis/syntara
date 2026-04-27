import {
  Button,
  Content,
  ContentVariants,
  Form,
  FormGroup,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from '@patternfly/react-core'
import { useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'

import { useAlerts } from '../../components/alerts'
import { getErrorMessage } from '../../utils/apiErrors'

import { accessClient } from './accessClient'
import { assignNewThenDeleteOldWithRollback } from './editAssignmentMutations'
import { TypeaheadSelect } from './TypeaheadSelect'
import type { PermissionRow } from './types'

type EditAssignmentDialogProps = {
  row: PermissionRow
  displayName: string
  onClose: () => void
  onSuccess: () => void
}

type EditAssignmentFormData = {
  roleName: string
}

export function EditAssignmentDialog({ row, displayName, onClose, onSuccess }: Readonly<EditAssignmentDialogProps>) {
  const { showSuccess, showError } = useAlerts()
  const [isPending, setIsPending] = useState(false)

  const isProjectScoped = row.scopeType === 'project'

  const rolesQuery = accessClient.useQuery('get', '/roles', { params: { query: { limit: 100 } } })

  const roleOptions = useMemo(
    () =>
      (rolesQuery.data?.resources ?? []).map((role) =>
        isProjectScoped ? { value: role.name, label: role.name } : { value: role.id, label: role.name }
      ),
    [rolesQuery.data, isProjectScoped]
  )

  const { handleSubmit, control, reset } = useForm<EditAssignmentFormData>({
    defaultValues: {
      roleName: '',
    },
  })

  useEffect(() => {
    reset({ roleName: isProjectScoped ? row.assignmentName : '' })
  }, [row, isProjectScoped, reset])

  const { mutateAsync: deleteRoleAssignment } = accessClient.useMutation('delete', '/role-assignments/{assignment_id}')
  const { mutateAsync: deleteProjectRoleAssignment } = accessClient.useMutation(
    'delete',
    '/projects/{project_id}/role-assignments/{assignment_id}'
  )

  const { mutateAsync: createRoleAssignment } = accessClient.useMutation('post', '/role-assignments')
  const { mutateAsync: createProjectRoleAssignment } = accessClient.useMutation(
    'post',
    '/projects/{project_id}/role-assignments'
  )

  const onSubmit = async (data: EditAssignmentFormData) => {
    const newRole = data.roleName
    if (!newRole || newRole === row.assignmentName) {
      onClose()
      return
    }

    setIsPending(true)
    try {
      if (row.sourceEndpoint === 'project-role-assignments') {
        if (!row.projectId) {
          showError('Update failed', 'Invalid assignment: missing project ID')
          setIsPending(false)
          return
        }
        const pid = row.projectId
        await assignNewThenDeleteOldWithRollback({
          assignNew: () =>
            createProjectRoleAssignment({
              params: { path: { project_id: pid } },
              body: { principal_type: row.principalType, principal_id: row.principalId, role_name: newRole },
            }),
          deleteOld: () =>
            deleteProjectRoleAssignment({ params: { path: { project_id: pid, assignment_id: row.id } } }),
          revokeNew: (newAssignmentId) =>
            deleteProjectRoleAssignment({ params: { path: { project_id: pid, assignment_id: newAssignmentId } } }),
        })
      } else {
        await assignNewThenDeleteOldWithRollback({
          assignNew: () =>
            createRoleAssignment({
              body: { principal_type: row.principalType, principal_id: row.principalId, role_name: newRole },
            }),
          deleteOld: () => deleteRoleAssignment({ params: { path: { assignment_id: row.id } } }),
          revokeNew: (newAssignmentId) =>
            deleteRoleAssignment({ params: { path: { assignment_id: newAssignmentId } } }),
        })
      }

      showSuccess('Assignment updated', `Updated role for ${displayName}`)
      onSuccess()
      onClose()
    } catch (error) {
      showError('Failed to update assignment', getErrorMessage(error))
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} variant="small">
      <ModalHeader title="Edit Assignment" />
      <ModalBody>
        <Form id="edit-assignment-form" onSubmit={handleSubmit(onSubmit)}>
          <FormGroup label="Principal" fieldId="principal-display">
            <Content component={ContentVariants.p}>{displayName}</Content>
          </FormGroup>

          <FormGroup label="Scope" fieldId="scope-display">
            <Content component={ContentVariants.p}>{row.scopeType === 'project' ? row.scopeName : 'System'}</Content>
          </FormGroup>

          <FormGroup label="Role" isRequired fieldId="role-select">
            <Controller
              name="roleName"
              control={control}
              rules={{ required: 'Role is required' }}
              render={({ field }) => (
                <TypeaheadSelect
                  id="role-select"
                  ariaLabel="Role"
                  options={roleOptions}
                  selected={field.value}
                  onChange={field.onChange}
                  placeholder="Select a role..."
                />
              )}
            />
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" form="edit-assignment-form" type="submit" isLoading={isPending}>
          Save
        </Button>
        <Button variant="link" onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}
