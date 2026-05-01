import { zodResolver } from '@hookform/resolvers/zod'
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
  TextInput,
} from '@patternfly/react-core'
import { Controller, useForm } from 'react-hook-form'

import { useAlerts } from '../../../components/alerts'
import { getErrorMessage } from '../../../utils/apiErrors'
import { accessClient } from '../../access/accessClient'

import { addProjectRoleSchema } from './addProjectRoleSchema'
import type { AddProjectRoleFormData } from './addProjectRoleSchema'
import { ProjectPolicySelect } from './ProjectPolicySelect'

type AddProjectRoleDialogProps = {
  projectId: string
  onClose: () => void
  onSuccess: () => void
}

export function AddProjectRoleDialog({ projectId, onClose, onSuccess }: Readonly<AddProjectRoleDialogProps>) {
  const { showSuccess, showError } = useAlerts()

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<AddProjectRoleFormData>({
    resolver: zodResolver(addProjectRoleSchema, undefined, { mode: 'sync' }),
    defaultValues: {
      name: '',
      description: '',
      policies: [],
    },
  })

  const { mutate: createRole, isPending } = accessClient.useMutation('post', '/projects/{project_id}/roles')

  const onSubmit = (data: AddProjectRoleFormData) => {
    createRole(
      {
        params: { path: { project_id: projectId } },
        body: {
          name: data.name,
          description: data.description || undefined,
          policies: data.policies,
        },
      },
      {
        onSuccess: () => {
          showSuccess({ title: 'Role added', description: 'Role created successfully' })
          onSuccess()
          onClose()
        },
        onError: (error) => {
          showError({ title: 'Failed to add role', description: getErrorMessage(error) })
        },
      }
    )
  }

  return (
    <Modal isOpen onClose={onClose} variant="medium">
      <ModalHeader title="Add Project Role" />
      <ModalBody>
        <Form id="add-project-role-form" onSubmit={handleSubmit(onSubmit)}>
          <FormGroup label="Name" isRequired fieldId="project-role-name">
            <TextInput
              id="project-role-name"
              isRequired
              aria-label="Role name"
              validated={errors.name ? 'error' : 'default'}
              {...register('name')}
            />
            {errors.name ? (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">{errors.name.message}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            ) : (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>Lowercase alphanumeric with hyphens (e.g. my-custom-role)</HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          <FormGroup label="Description" fieldId="project-role-description">
            <TextInput
              id="project-role-description"
              aria-label="Role description"
              validated={errors.description ? 'error' : 'default'}
              {...register('description')}
            />
            {errors.description && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">{errors.description.message}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          <FormGroup label="Policies" isRequired fieldId="project-role-policies">
            <Controller
              name="policies"
              control={control}
              render={({ field }) => (
                <ProjectPolicySelect
                  projectId={projectId}
                  selected={field.value}
                  onChange={field.onChange}
                  hasError={!!errors.policies}
                />
              )}
            />
            {errors.policies && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">{errors.policies.message}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" form="add-project-role-form" type="submit" isLoading={isPending}>
          Add
        </Button>
        <Button variant="link" onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}
