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
    '/projects/{project_id}/roles/{assignment_id}'
  )
  const { mutateAsync: deleteProjectGroupRole } = accessClient.useMutation(
    'delete',
    '/projects/{project_id}/group-roles/{assignment_id}'
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
  const { mutateAsync: assignProjectRole } = accessClient.useMutation('post', '/projects/{project_id}/roles')
  const { mutateAsync: assignProjectGroupRole } = accessClient.useMutation('post', '/projects/{project_id}/group-roles')
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
      // Delete old assignment, then create new one.
      // If the create fails, attempt to restore the original assignment.
      if (row.sourceEndpoint === 'project-roles') {
        if (!row.projectId) {
          showError('Invalid assignment: missing project ID', 'Update Failed')
          setIsPending(false)
          return
        }
        await deleteProjectRole({ params: { path: { project_id: row.projectId, assignment_id: row.id } } })
        try {
          await assignProjectRole({
            params: { path: { project_id: row.projectId } },
            body: { user_id: row.principalId, role_name: newRole },
          })
        } catch (assignError) {
          await assignProjectRole({
            params: { path: { project_id: row.projectId } },
            body: { user_id: row.principalId, role_name: row.assignmentName },
          }).catch(() => {})
          throw assignError
        }
      } else if (row.sourceEndpoint === 'project-group-roles') {
        if (!row.projectId) {
          showError('Invalid assignment: missing project ID', 'Update Failed')
          setIsPending(false)
          return
        }
        await deleteProjectGroupRole({ params: { path: { project_id: row.projectId, assignment_id: row.id } } })
        try {
          await assignProjectGroupRole({
            params: { path: { project_id: row.projectId } },
            body: { group_id: row.principalId, role_name: newRole },
          })
        } catch (assignError) {
          await assignProjectGroupRole({
            params: { path: { project_id: row.projectId } },
            body: { group_id: row.principalId, role_name: row.assignmentName },
          }).catch(() => {})
          throw assignError
        }
      } else if (row.sourceEndpoint === 'user-role-assignments') {
        await deleteSystemUserRole({ params: { path: { assignment_id: row.id } } })
        try {
          await assignSystemUserRole({ body: { user_id: row.principalId, role_id: newRole } })
        } catch (assignError) {
          await assignSystemUserRole({ body: { user_id: row.principalId, role_id: row.assignmentName } }).catch(
            () => {}
          )
          throw assignError
        }
      } else {
        await deleteSystemGroupRole({ params: { path: { assignment_id: row.id } } })
        try {
          await assignSystemGroupRole({ body: { group_id: row.principalId, role_id: newRole } })
        } catch (assignError) {
          await assignSystemGroupRole({ body: { group_id: row.principalId, role_id: row.assignmentName } }).catch(
            () => {}
          )
          throw assignError
        }
      }

      showSuccess(`Updated role for ${displayName}`, 'Assignment Updated')
      onSuccess()
      onClose()
    } catch (error) {
      showError(getErrorMessage(error), 'Failed to Update Assignment')
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
