import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, CompassPanel, FlexItem, Form, Stack, StackItem } from '@patternfly/react-core'
import { useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useParams } from 'wouter'
import { navigate } from 'wouter/use-browser-location'

import { AppPage } from '../../../app/AppPage'
import { AppPageHeader } from '../../../app/AppPageHeader'
import { AppRoute } from '../../../app/AppRoute'
import { authClient } from '../../../client'
import { useAlerts } from '../../../components/alerts'
import { useQueryState } from '../../../components/states/useQueryState'
import { useFormMutationErrorHandler } from '../../../hooks/useFormMutationErrorHandler'
import { useAuthStore } from '../../../stores/useAuthStore'
import { getErrorMessage } from '../../../utils/apiErrors'
import { detachPromise } from '../../../utils/detachPromise'
import { isValidUUID } from '../../../utils/generateUUID'
import { accessClient } from '../../access/accessClient'
import { userFormSchema, userCreateSchema, splitFullName, toFullName, type UserFormData } from '../userFormSchema'

import { UserFormFields } from './UserFormFields'
import { UserNotFoundState } from './UserNotFoundState'

function useCurrentUserId(enabled: boolean): string | undefined {
  const meQuery = authClient.useQuery('get', '/me', {}, { enabled })
  return meQuery.data?.id
}

type UserFormProps = {
  mode: 'create' | 'edit'
}

const DEFAULT_VALUES: UserFormData = {
  username: '',
  first_name: '',
  last_name: '',
  email: '',
  password: '',
  is_active: true,
}

export function UserForm({ mode }: Readonly<UserFormProps>) {
  const isEdit = mode === 'edit'
  const pageTitle = isEdit ? 'Edit User' : 'Create User'
  const submitLabel = isEdit ? 'Save' : 'Create'

  const { userId } = useParams<{ userId: string }>()
  const isValidId = !!userId && isValidUUID(userId)

  const userQuery = accessClient.useQuery(
    'get',
    '/users/{user_id}',
    { params: { path: { user_id: userId ?? '' } } },
    { enabled: isEdit && isValidId, retry: false }
  )

  const userData = userQuery.data
  const formValues = useMemo(
    () =>
      userData
        ? {
            username: userData.username,
            ...splitFullName(userData.full_name ?? ''),
            email: userData.email,
            password: '',
            is_active: userData.is_active,
          }
        : undefined,
    [userData]
  )

  const schema = isEdit ? userFormSchema : userCreateSchema
  const { control, handleSubmit, setError } = useForm<UserFormData>({
    resolver: zodResolver(schema, undefined, { mode: 'sync' }),
    defaultValues: formValues ?? DEFAULT_VALUES,
    values: isEdit && formValues ? formValues : undefined,
  })

  const handleError = useFormMutationErrorHandler<UserFormData>(setError)
  const { mutate: createUser, isPending: isCreating } = accessClient.useMutation('post', '/users')
  const { mutate: updateUser, isPending: isUpdating } = accessClient.useMutation('patch', '/users/{user_id}')
  const { showAlert } = useAlerts()
  const logout = useAuthStore((s) => s.logout)
  const isSaving = isCreating || isUpdating
  const currentUserId = useCurrentUserId(isEdit)
  const isSelf = isEdit && userId === currentUserId
  const passwordValue = useWatch({ control, name: 'password' })
  const hasPasswordChange = !!passwordValue
  const showPasswordWarning = isEdit && hasPasswordChange

  const navigateBack = () => navigate(AppRoute.AccessManagement.Users)

  const handleUpdateSuccess = () => {
    showAlert({ title: 'User updated', variant: 'success', autoDismiss: true })
    navigateBack()
  }

  const handlePasswordChangeSuccess = () => {
    if (isSelf) {
      showAlert({ title: 'Password changed — signing out', variant: 'success', autoDismiss: true })
      detachPromise(logout(), {
        onReject: (error: unknown) => {
          showAlert({
            title: 'Sign out failed',
            description: getErrorMessage(error),
            variant: 'danger',
            autoDismiss: false,
          })
        },
      })
    } else {
      showAlert({
        title: 'User updated',
        description: 'Password changed — all active sessions for this user have been revoked.',
        variant: 'success',
        autoDismiss: true,
      })
      navigateBack()
    }
  }

  const onSubmit = (formData: UserFormData) => {
    const fullName = toFullName(formData.first_name, formData.last_name)
    const context = formData.username ? `User "${formData.username}"` : undefined

    if (isEdit && isValidId) {
      updateUser(
        {
          params: { path: { user_id: userId } },
          body: {
            full_name: fullName,
            email: formData.email,
            is_active: formData.is_active,
            ...(formData.password ? { password: formData.password } : {}),
          },
        },
        {
          onSuccess: formData.password ? handlePasswordChangeSuccess : handleUpdateSuccess,
          onError: handleError({ title: 'Failed to update user', context }),
        }
      )
    } else {
      createUser(
        {
          body: {
            username: formData.username,
            email: formData.email,
            full_name: fullName,
            password: formData.password ?? '',
            is_active: formData.is_active,
          },
        },
        {
          onSuccess: () => {
            showAlert({ title: 'User created', variant: 'success', autoDismiss: true })
            navigateBack()
          },
          onError: handleError({ title: 'Failed to create user', context }),
        }
      )
    }
  }

  const refetchUser = userQuery.refetch
  const queryState = useQueryState(userQuery, {
    title: 'Error loading user',
    onRetry: () => {
      detachPromise(refetchUser())
    },
  })
  if (isEdit && userQuery.error) {
    return (
      <AppPage>
        <AppPageHeader title="Edit User" />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>
            <UserNotFoundState
              onBack={navigateBack}
              onRetry={() => {
                detachPromise(refetchUser())
              }}
            />
          </CompassPanel>
        </StackItem>
      </AppPage>
    )
  }
  if (isEdit && queryState) {
    return (
      <AppPage>
        <AppPageHeader title={pageTitle} />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>{queryState}</CompassPanel>
        </StackItem>
      </AppPage>
    )
  }

  return (
    <AppPage>
      <AppPageHeader title={pageTitle}>
        <FlexItem grow={{ default: 'grow' }} />
        <Button variant="link" onClick={navigateBack}>
          Cancel
        </Button>
        <Button type="submit" form="user-form" isLoading={isSaving} isDisabled={isSaving}>
          {submitLabel}
        </Button>
      </AppPageHeader>
      <CompassPanel style={{ padding: 'var(--pf-t--global--spacer--xl)' }}>
        <Stack hasGutter style={{ maxWidth: '600px' }}>
          {showPasswordWarning && (
            <StackItem>
              <Alert variant="warning" title={isSelf ? 'You will be signed out' : 'User will be signed out'} isInline>
                {isSelf
                  ? 'Changing your own password will end all active sessions. You will need to sign in again with your new password.'
                  : "Changing this user's password will revoke all their active sessions. They will need to sign in again."}
              </Alert>
            </StackItem>
          )}
          <StackItem>
            <Form id="user-form" onSubmit={handleSubmit(onSubmit)}>
              <UserFormFields control={control} isEdit={isEdit} />
            </Form>
          </StackItem>
        </Stack>
      </CompassPanel>
    </AppPage>
  )
}
