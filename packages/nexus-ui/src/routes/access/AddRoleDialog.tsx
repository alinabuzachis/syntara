import { zodResolver } from '@hookform/resolvers/zod'
import {
  Button,
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  TextInput,
} from '@patternfly/react-core'
import { RhUiAddIcon } from '@patternfly/react-icons'
import { useMemo } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'

import { useAlerts } from '../../providers/alerts'
import { getErrorMessage } from '../../utils/apiErrors'

import { accessClient } from './accessClient'
import { addRoleSchema } from './addRoleSchema'
import type { AddRoleFormData } from './addRoleSchema'
import { PolicySelect } from './PolicySelect'
import { TypeaheadSelect } from './TypeaheadSelect'
import { useAllProjects } from './useAllProjects'

type AddRoleDialogProps = {
  onClose: () => void
  onSuccess: () => void
  defaultScope?: 'system' | 'project'
  defaultProjectId?: string
}

export function AddRoleDialog({ onClose, onSuccess, defaultScope, defaultProjectId }: Readonly<AddRoleDialogProps>) {
  const { showSuccess, showError } = useAlerts()

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<AddRoleFormData>({
    resolver: zodResolver(addRoleSchema, undefined, { mode: 'sync' }),
    defaultValues: {
      name: '',
      description: '',
      scope: defaultScope ?? 'system',
      projectId: defaultProjectId ?? '',
      policies: [],
    },
  })

  const scope = useWatch({ control, name: 'scope' })
  const projectId = useWatch({ control, name: 'projectId' })

  const handleScopeChange = (newScope: string) => {
    setValue('scope', newScope as 'system' | 'project')
    setValue('policies', [])
    if (newScope === 'system') {
      setValue('projectId', '')
    }
  }

  const handleProjectChange = (newProjectId: string) => {
    setValue('projectId', newProjectId)
    setValue('policies', [])
  }

  const { projects: allProjects } = useAllProjects()
  const projectOptions = useMemo(
    () =>
      allProjects.filter((p): p is typeof p & { id: string } => !!p.id).map((p) => ({ value: p.id, label: p.name })),
    [allProjects]
  )

  const { mutate: createRole, isPending } = accessClient.useMutation('post', '/roles')

  const onSubmit = (data: AddRoleFormData) => {
    createRole(
      {
        body: {
          name: data.name,
          description: data.description || undefined,
          policies: data.policies,
          project_id: data.scope === 'project' ? data.projectId : undefined,
        },
      },
      {
        onSuccess: () => {
          showSuccess({
            title: 'Role created',
            description: (
              <>
                {'The role '}
                {data.name}
                {' has been created successfully.'}
              </>
            ),
          })
          onSuccess()
          onClose()
        },
        onError: (error) => {
          showError({ title: 'Failed to create role', description: getErrorMessage(error) })
        },
      }
    )
  }

  return (
    <Modal isOpen onClose={onClose} variant="medium">
      <ModalHeader title="Create role" />
      <ModalBody>
        <Form id="add-role-form" onSubmit={handleSubmit(onSubmit)}>
          <FormGroup label="Name" isRequired fieldId="role-name">
            <TextInput
              id="role-name"
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

          <FormGroup label="Description" fieldId="role-description">
            <TextInput
              id="role-description"
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

          <FormGroup label="Scope" isRequired fieldId="role-scope">
            <FormSelect
              id="role-scope"
              aria-label="Role scope"
              value={scope}
              onChange={(_e, val) => handleScopeChange(val)}
              validated={errors.scope ? 'error' : 'default'}
            >
              <FormSelectOption value="system" label="System" />
              <FormSelectOption value="project" label="Project" />
            </FormSelect>
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  {scope === 'system'
                    ? 'System-scoped roles apply across all projects'
                    : 'Project-scoped roles are limited to a specific project'}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          {scope === 'project' && (
            <FormGroup label="Project" isRequired fieldId="role-project">
              <TypeaheadSelect
                id="role-project"
                ariaLabel="Project"
                options={projectOptions}
                selected={projectId ?? ''}
                onChange={handleProjectChange}
                placeholder="Select a project..."
                hasError={!!errors.projectId}
              />
              {errors.projectId && (
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem variant="error">{errors.projectId.message}</HelperTextItem>
                  </HelperText>
                </FormHelperText>
              )}
            </FormGroup>
          )}

          <FormGroup label="Policies" isRequired fieldId="role-policies">
            <Controller
              name="policies"
              control={control}
              render={({ field }) => (
                <PolicySelect
                  selected={field.value}
                  onChange={field.onChange}
                  hasError={!!errors.policies}
                  projectEligible={scope === 'project'}
                  isDisabled={scope === 'project' && !projectId}
                />
              )}
            />
            {scope === 'project' && !projectId ? (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>Select a project first to see available policies</HelperTextItem>
                </HelperText>
              </FormHelperText>
            ) : (
              errors.policies && (
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem variant="error">{errors.policies.message}</HelperTextItem>
                  </HelperText>
                </FormHelperText>
              )
            )}
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" form="add-role-form" type="submit" isLoading={isPending} icon={<RhUiAddIcon />}>
          Create role
        </Button>
        <Button variant="link" onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}
