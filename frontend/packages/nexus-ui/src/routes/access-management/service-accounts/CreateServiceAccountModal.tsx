import { zodResolver } from '@hookform/resolvers/zod'
import {
  Alert,
  Button,
  Checkbox,
  ClipboardCopy,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  MenuToggle,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Select,
  SelectList,
  SelectOption,
  TextArea,
  TextInput,
} from '@patternfly/react-core'
import { RhUiAddIcon, RhUiErrorIcon } from '@patternfly/react-icons'
import { type Ref, useCallback, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'

import { tanstackRouter } from '../../../app/tanstackRouter'
import { useFormMutationErrorHandler } from '../../../hooks/useFormMutationErrorHandler'
import { useAlerts } from '../../../providers/alerts'
import { detachPromise } from '../../../utils/detachPromise'
import { accessClient } from '../../access/accessClient'
import { useAllProjects } from '../../access/useAllProjects'
import { getServiceAccountDetailPath } from '../accessManagementPaths'

import { createServiceAccountSchema, type CreateServiceAccountFormData } from './serviceAccountFormSchema'

type CreateServiceAccountModalProps = {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

type CredentialsResult = {
  id: string
  name: string
  identifier: string
  client_secret: string
}

function ProjectSelectToggle({
  toggleRef,
  label,
  isOpen,
  onToggle,
  onBlur,
}: Readonly<{
  toggleRef: Ref<HTMLButtonElement>
  label: string
  isOpen: boolean
  onToggle: () => void
  onBlur: () => void
}>) {
  return (
    <MenuToggle ref={toggleRef} onClick={onToggle} onBlur={onBlur} isExpanded={isOpen} isFullWidth>
      {label}
    </MenuToggle>
  )
}

function ProjectSelect({
  value,
  onChange,
  onBlur,
  projects,
}: Readonly<{
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  projects: ReadonlyArray<{ id: string; name: string }>
}>) {
  const [isOpen, setIsOpen] = useState(false)
  const selectedLabel = projects.find((p) => p.id === value)?.name ?? 'Select a project'

  return (
    <Select
      id="sa-project"
      aria-label="Project"
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      onSelect={(_e, val) => {
        onChange(String(val))
        setIsOpen(false)
      }}
      selected={value}
      popperProps={{ appendTo: 'inline' }}
      toggle={(ref) => (
        <ProjectSelectToggle
          toggleRef={ref}
          label={selectedLabel}
          isOpen={isOpen}
          onToggle={() => setIsOpen(!isOpen)}
          onBlur={onBlur}
        />
      )}
      shouldFocusToggleOnSelect
    >
      <SelectList>
        {projects.map((p) => (
          <SelectOption key={p.id} value={p.id} isSelected={p.id === value}>
            {p.name}
          </SelectOption>
        ))}
      </SelectList>
    </Select>
  )
}

function CredentialsRevealPhase({
  credentials,
  onClose,
}: Readonly<{
  credentials: CredentialsResult
  onClose: () => void
}>) {
  const [savedAck, setSavedAck] = useState(false)

  return (
    <>
      <ModalBody>
        <Form onSubmit={(e) => e.preventDefault()}>
          <Alert variant="warning" isInline title="Save these credentials now">
            The client secret will not be shown again. Copy and store it securely before closing this dialog. This
            service account has no permissions yet — assign roles on the Assignments tab to grant access.
          </Alert>

          <FormGroup label="Client ID" fieldId="sa-cred-identifier">
            <ClipboardCopy isReadOnly hoverTip="Copy" clickTip="Copied">
              {credentials.identifier}
            </ClipboardCopy>
          </FormGroup>

          <FormGroup label="Client secret" fieldId="sa-cred-client-secret">
            <ClipboardCopy isReadOnly hoverTip="Copy" clickTip="Copied">
              {credentials.client_secret}
            </ClipboardCopy>
          </FormGroup>

          <Checkbox
            id="sa-saved-ack"
            label="I have saved the credentials"
            isChecked={savedAck}
            onChange={(_event, checked) => setSavedAck(checked)}
          />
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          isDisabled={!savedAck}
          onClick={() => {
            onClose()
            detachPromise(tanstackRouter.navigate({ to: getServiceAccountDetailPath(credentials.id) + '/assignments' }))
          }}
        >
          Proceed to assignments
        </Button>
        <Button variant="link" isDisabled={!savedAck} onClick={onClose}>
          Close
        </Button>
      </ModalFooter>
    </>
  )
}

function CreateServiceAccountFormPhase({
  onCreated,
  onCancel,
  onListRefresh,
}: Readonly<{
  onCreated: (credentials: CredentialsResult) => void
  onCancel: () => void
  onListRefresh: () => void
}>) {
  const { showWarning, showSuccess } = useAlerts()
  const { projects } = useAllProjects()

  const projectOptions = useMemo(
    () =>
      projects
        .filter((p): p is typeof p & { id: string } => typeof p.id === 'string')
        .map((p) => ({ id: p.id, name: p.name })),
    [projects]
  )

  const { control, handleSubmit, setError } = useForm<CreateServiceAccountFormData>({
    resolver: zodResolver(createServiceAccountSchema, undefined, { mode: 'sync' }),
    defaultValues: {
      name: '',
      description: '',
      project_id: '',
    },
  })

  const handleError = useFormMutationErrorHandler<CreateServiceAccountFormData>(setError)

  const { mutate: createServiceAccount, isPending: isCreatingSA } = accessClient.useMutation(
    'post',
    '/service_accounts'
  )
  const { mutate: createCredential, isPending: isCreatingCred } = accessClient.useMutation(
    'post',
    '/service_accounts/{service_account_id}/credentials'
  )

  const isPending = isCreatingSA || isCreatingCred

  const onSubmit = useCallback(
    (formData: CreateServiceAccountFormData) => {
      createServiceAccount(
        {
          body: {
            name: formData.name,
            description: formData.description ?? undefined,
            project_id: formData.project_id,
          },
        },
        {
          onSuccess: (saResponse) => {
            createCredential(
              {
                params: { path: { service_account_id: saResponse.id } },
                body: { credential_type: 'client_credentials' },
              },
              {
                onSuccess: (credResponse) => {
                  onCreated({
                    id: saResponse.id,
                    name: saResponse.name,
                    identifier: credResponse.identifier,
                    client_secret: credResponse.client_secret ?? '',
                  })
                  showSuccess({
                    title: 'Service account created',
                    description: `Service account "${saResponse.name}" has been created successfully.`,
                  })
                },
                onError: () => {
                  showWarning({
                    title: 'Credential creation failed',
                    description: `Service account "${saResponse.name}" was created but credential generation failed. You can create credentials from the detail page.`,
                  })
                  onListRefresh()
                  onCancel()
                  detachPromise(
                    tanstackRouter.navigate({ to: getServiceAccountDetailPath(saResponse.id) + '/credentials' })
                  )
                },
              }
            )
          },
          onError: handleError({ title: 'Failed to create service account', context: formData.name }),
        }
      )
    },
    [createServiceAccount, createCredential, handleError, showWarning, showSuccess, onCreated, onCancel, onListRefresh]
  )

  return (
    <>
      <ModalBody>
        <Form id="create-service-account-form" onSubmit={handleSubmit(onSubmit)}>
          <Controller
            name="project_id"
            control={control}
            render={({ field, fieldState }) => (
              <FormGroup label="Project" fieldId="sa-project" isRequired>
                <ProjectSelect
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  projects={projectOptions}
                />
                {fieldState.error && (
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                        {fieldState.error.message}
                      </HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                )}
              </FormGroup>
            )}
          />
          <Controller
            name="name"
            control={control}
            render={({ field, fieldState }) => (
              <FormGroup label="Name" fieldId="sa-name" isRequired>
                <TextInput
                  id="sa-name"
                  aria-label="Name"
                  placeholder="my-service-account"
                  validated={fieldState.error ? 'error' : 'default'}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                />
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem
                      variant={fieldState.error ? 'error' : 'default'}
                      icon={fieldState.error ? <RhUiErrorIcon /> : undefined}
                    >
                      {fieldState.error?.message ??
                        'Lowercase letters, numbers, and hyphens. Must start and end with a letter or number.'}
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>
            )}
          />
          <Controller
            name="description"
            control={control}
            render={({ field, fieldState }) => (
              <FormGroup label="Description" fieldId="sa-description">
                <TextArea
                  id="sa-description"
                  aria-label="Description"
                  placeholder="Describe the purpose of this service account"
                  validated={fieldState.error ? 'error' : 'default'}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                  rows={3}
                />
                {fieldState.error && (
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                        {fieldState.error.message}
                      </HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                )}
              </FormGroup>
            )}
          />
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          type="submit"
          form="create-service-account-form"
          isDisabled={isPending}
          isLoading={isPending}
          icon={<RhUiAddIcon />}
        >
          Create service account
        </Button>
        <Button variant="link" onClick={onCancel} isDisabled={isPending}>
          Cancel
        </Button>
      </ModalFooter>
    </>
  )
}

export function CreateServiceAccountModal({ isOpen, onClose, onSuccess }: Readonly<CreateServiceAccountModalProps>) {
  const [credentials, setCredentials] = useState<CredentialsResult | null>(null)

  const handleClose = useCallback(() => {
    setCredentials(null)
    onClose()
  }, [onClose])

  const handleCreated = useCallback(
    (creds: CredentialsResult) => {
      setCredentials(creds)
      onSuccess()
    },
    [onSuccess]
  )

  const title = credentials ? 'Service account created' : 'Create service account'

  return (
    <Modal isOpen={isOpen} onClose={handleClose} variant="medium">
      <ModalHeader title={title} />

      {credentials ? (
        <CredentialsRevealPhase credentials={credentials} onClose={handleClose} />
      ) : (
        isOpen && (
          <CreateServiceAccountFormPhase onCreated={handleCreated} onCancel={handleClose} onListRefresh={onSuccess} />
        )
      )}
    </Modal>
  )
}
