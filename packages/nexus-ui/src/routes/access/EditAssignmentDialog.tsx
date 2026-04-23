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

interface EditAssignmentDialogProps {
  row: PermissionRow
  displayName: string
  onClose: () => void
  onSuccess: () => void
}

interface EditAssignmentFormData {
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

  // Mutations for delete
  const { mutateAsync: deleteProjectRole } = accessClient.useMutation(
    'delete',
    '/projects/{project_id}/role-assignments/{assignment_id}'
  )
  const { mutateAsync: deleteProjectGroupRole } = accessClient.useMutation(
    'delete',
    '/projects/{project_id}/group-role-assignments/{assignment_id}'
  )
  const { mutateAsync: deleteSystemUserRole } = accessClient.useMutation(
    'delete',
    '/user-role-assignments/{assignment_id}'
  )
  const { mutateAsync: deleteSystemGroupRole } = accessClient.useMutation(
    'delete',
    '/group-role-assignments/{assignment_id}'
  )

  // Mutations for create
  const { mutateAsync: assignProjectRole } = accessClient.useMutation('post', '/projects/{project_id}/role-assignments')
  const { mutateAsync: assignProjectGroupRole } = accessClient.useMutation(
    'post',
    '/projects/{project_id}/group-role-assignments'
  )
  const { mutateAsync: assignSystemUserRole } = accessClient.useMutation('post', '/user-role-assignments')
  const { mutateAsync: assignSystemGroupRole } = accessClient.useMutation('post', '/group-role-assignments')

  const onSubmit = async (data: EditAssignmentFormData) => {
    const newRole = data.roleName
    if (!newRole || newRole === row.assignmentName) {
      onClose()
      return
    }

    setIsPending(true)
    try {
      // Assign the new role first, then remove the old assignment, so the principal is never
      // left without a role. If delete fails, revoke the new assignment to roll back.
      if (row.sourceEndpoint === 'project-roles') {
        if (!row.projectId) {
          showError('Update failed', 'Invalid assignment: missing project ID')
          setIsPending(false)
          return
        }
        const pid = row.projectId
        await assignNewThenDeleteOldWithRollback({
          assignNew: () =>
            assignProjectRole({
              params: { path: { project_id: pid } },
              body: { user_id: row.principalId, role_name: newRole },
            }),
          deleteOld: () => deleteProjectRole({ params: { path: { project_id: pid, assignment_id: row.id } } }),
          revokeNew: (newAssignmentId) =>
            deleteProjectRole({ params: { path: { project_id: pid, assignment_id: newAssignmentId } } }),
        })
      } else if (row.sourceEndpoint === 'project-group-roles') {
        if (!row.projectId) {
          showError('Update failed', 'Invalid assignment: missing project ID')
          setIsPending(false)
          return
        }
        const pid = row.projectId
        await assignNewThenDeleteOldWithRollback({
          assignNew: () =>
            assignProjectGroupRole({
              params: { path: { project_id: pid } },
              body: { group_id: row.principalId, role_name: newRole },
            }),
          deleteOld: () => deleteProjectGroupRole({ params: { path: { project_id: pid, assignment_id: row.id } } }),
          revokeNew: (newAssignmentId) =>
            deleteProjectGroupRole({ params: { path: { project_id: pid, assignment_id: newAssignmentId } } }),
        })
      } else if (row.sourceEndpoint === 'user-role-assignments') {
        if (!row.roleId) {
          showError('Update failed', 'Invalid assignment: missing role ID')
          setIsPending(false)
          return
        }
        await assignNewThenDeleteOldWithRollback({
          assignNew: () => assignSystemUserRole({ body: { user_id: row.principalId, role_name: newRole } }),
          deleteOld: () => deleteSystemUserRole({ params: { path: { assignment_id: row.id } } }),
          revokeNew: (newAssignmentId) =>
            deleteSystemUserRole({ params: { path: { assignment_id: newAssignmentId } } }),
        })
      } else {
        if (!row.roleId) {
          showError('Update failed', 'Invalid assignment: missing role ID')
          setIsPending(false)
          return
        }
        await assignNewThenDeleteOldWithRollback({
          assignNew: () => assignSystemGroupRole({ body: { group_id: row.principalId, role_name: newRole } }),
          deleteOld: () => deleteSystemGroupRole({ params: { path: { assignment_id: row.id } } }),
          revokeNew: (newAssignmentId) =>
            deleteSystemGroupRole({ params: { path: { assignment_id: newAssignmentId } } }),
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
