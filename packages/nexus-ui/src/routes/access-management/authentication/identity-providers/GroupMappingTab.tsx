import { Alert, AlertActionCloseButton, Button, Flex, FlexItem, Title } from '@patternfly/react-core'
import { RhUiSyncIcon } from '@patternfly/react-icons'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { identityProvidersClient } from '../../../../client'
import { useAlerts } from '../../../../components/alerts'
import { useMutationErrorHandler } from '../../../../hooks/useMutationErrorHandler'
import { useAllGroups } from '../../../access/useAllGroups'
import { GroupFormModal } from '../../GroupFormModal'

import {
  AdvancedSection,
  AutoCreateGroupsState,
  EmptyMappingState,
  MappingTable,
  ReadOnlyView,
} from './GroupMappingComponents'
import {
  buildSavePayload,
  nextKey,
  processDiscoveredGroups,
  toFormEntries,
  type GroupMappingConfig,
  type GroupMappingEntry,
  type OIDCConfigurationResponse,
} from './groupMappingUtils'
import { IDP_TYPE_PRESETS } from './idpTypePresets'
import { useTestSignIn } from './useTestSignIn'

function signInAlertTitle(variant: string): string {
  if (variant === 'success') return 'Groups discovered'
  if (variant === 'danger') return 'Sign-in failed'
  return 'No groups found'
}

/**
 * Editable group mapping table shown on the identity provider detail page.
 *
 * Form state rationale: This component uses `useState` instead of Zod + react-hook-form
 * because the mapping table has dynamic add/remove row semantics and patches the provider
 * configuration directly via `PATCH /{provider_id}` — it is not part of a traditional
 * form submission flow. The wizard counterpart (`GroupMappingStep`) uses react-hook-form
 * because its data is submitted as part of the multi-step provider creation form.
 *
 * State overview:
 * - `entries` — the editable mapping rows; initialized from the server's `groupMapping`
 *   prop and reset on cancel. Rows can be added manually or populated via test sign-in.
 * - `expression` — the JMESPath extraction expression, editable in the Advanced section.
 * - `isEditing` — toggles between read-only view and edit mode. The component starts in
 *   read-only if mappings exist, or shows an empty state if none are configured.
 * - `signInAlert` / `rawClaims` — feedback from the test-sign-in popup flow. `rawClaims`
 *   is displayed in the Advanced section so admins can inspect the full token.
 * - `showValidation` — deferred validation flag. Validation errors (incomplete rows) are
 *   only shown after the first save attempt, not while the user is still adding rows.
 * - `createGroupForIndex` — tracks which mapping row triggered the "Create new group"
 *   modal, so the newly created group can be auto-selected in that row on success.
 */
type GroupMappingTabProps = {
  providerId: string
  idpType?: string | null
  autoCreateGroups?: boolean
  providerConfig: OIDCConfigurationResponse
  groupMapping: GroupMappingConfig | null | undefined
  onSaved: () => void
  editMappingTrigger?: number
}

// eslint-disable-next-line max-lines-per-function
export function GroupMappingTab({
  providerId,
  idpType,
  autoCreateGroups,
  providerConfig,
  groupMapping,
  onSaved,
  editMappingTrigger,
}: Readonly<GroupMappingTabProps>) {
  const defaultExpression = idpType ? (IDP_TYPE_PRESETS[idpType]?.groupMappingExpression ?? null) : null
  const [entries, setEntries] = useState<GroupMappingEntry[]>(() => toFormEntries(groupMapping))
  const [expression, setExpression] = useState(
    groupMapping?.group_jmespath_expression ?? defaultExpression ?? 'groups[*]'
  )
  const [isEditing, setIsEditing] = useState(() => (editMappingTrigger ?? 0) > 0)
  const prevTriggerRef = useRef(editMappingTrigger)
  useEffect(() => {
    if (editMappingTrigger !== undefined && editMappingTrigger !== prevTriggerRef.current) {
      prevTriggerRef.current = editMappingTrigger
      setIsEditing(true)
    }
  }, [editMappingTrigger])
  const [signInAlert, setSignInAlert] = useState<{ variant: 'success' | 'warning' | 'danger'; message: string } | null>(
    null
  )
  const [rawClaims, setRawClaims] = useState<string | null>(null)
  const [showValidation, setShowValidation] = useState(false)
  const { showAlert } = useAlerts()
  const handleMutationError = useMutationErrorHandler()

  const { mutate: patchProvider, isPending: isSaving } = identityProvidersClient.useMutation(
    'patch',
    '/identity_providers/{provider_id}'
  )

  const { groups: allGroupsRaw, refetch: refetchGroups } = useAllGroups()
  const nexusGroups = useMemo(() => allGroupsRaw.filter((g) => g.name !== 'authenticated'), [allGroupsRaw])

  const [createGroupForIndex, setCreateGroupForIndex] = useState<number | null>(null)

  const handleTestResult = useCallback(
    (claims: Record<string, unknown>) => {
      setRawClaims(JSON.stringify(claims, null, 2))
      const result = processDiscoveredGroups(claims, expression, entries, nexusGroups)
      setEntries(result.newEntries)
      setSignInAlert({ variant: result.variant, message: result.message })
    },
    [expression, entries, nexusGroups]
  )

  const handleTestError = useCallback(() => {
    setSignInAlert({
      variant: 'danger',
      message: 'Could not connect to the identity provider. Verify the provider is reachable and try again.',
    })
  }, [])

  const { openTestSignIn, isListening } = useTestSignIn({
    providerId,
    onResult: handleTestResult,
    onError: handleTestError,
  })
  const handleEntryChange = useCallback(
    (index: number, updated: GroupMappingEntry) =>
      setEntries((prev) => prev.map((e, i) => (i === index ? updated : e))),
    []
  )
  const handleRemove = useCallback((index: number) => setEntries((prev) => prev.filter((_, i) => i !== index)), [])
  const handleAdd = useCallback(
    () => setEntries((prev) => [...prev, { key: nextKey(), idpGroupValue: '', nexusGroupId: '' }]),
    []
  )

  const hasIncompleteEntries = entries.some(
    (e) => (e.idpGroupValue && !e.nexusGroupId) || (!e.idpGroupValue && e.nexusGroupId)
  )
  const handleSave = useCallback(() => {
    if (hasIncompleteEntries) {
      setShowValidation(true)
      return
    }
    patchProvider(
      {
        params: { path: { provider_id: providerId } },
        body: buildSavePayload(providerConfig, expression, entries),
      },
      {
        onSuccess: () => {
          showAlert({ title: 'Group mapping saved', variant: 'success', autoDismiss: true })
          setIsEditing(false)
          onSaved()
        },
        onError: handleMutationError({ title: 'Failed to save group mapping' }),
      }
    )
  }, [
    hasIncompleteEntries,
    providerId,
    providerConfig,
    expression,
    entries,
    patchProvider,
    showAlert,
    onSaved,
    handleMutationError,
  ])

  const handleGroupCreated = useCallback(async () => {
    try {
      const result = await refetchGroups()
      const newGroups = result.data ?? []
      const index = createGroupForIndex
      const entry = index !== null ? entries[index] : undefined
      if (entry && index !== null && newGroups.length > 0) {
        const newest = [...newGroups].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0]
        if (newest?.id) handleEntryChange(index, { ...entry, nexusGroupId: newest.id })
      }
    } finally {
      setCreateGroupForIndex(null)
    }
  }, [refetchGroups, createGroupForIndex, entries, handleEntryChange])
  const handleCancel = useCallback(() => {
    setEntries(toFormEntries(groupMapping))
    setIsEditing(false)
    setSignInAlert(null)
    setShowValidation(false)
  }, [groupMapping])

  if (autoCreateGroups) return <AutoCreateGroupsState />
  const hasEntries = entries.length > 0

  if (!hasEntries && !signInAlert && !isEditing) {
    return (
      <EmptyMappingState
        onTestSignIn={() => {
          setIsEditing(true)
          openTestSignIn()
        }}
        onAddManually={() => {
          setIsEditing(true)
          handleAdd()
        }}
      />
    )
  }

  if (!isEditing) {
    return <ReadOnlyView entries={entries} nexusGroups={nexusGroups} />
  }

  return (
    <Flex direction={{ default: 'column' }} gap={{ default: 'gapLg' }}>
      <FlexItem>
        <Flex alignItems={{ default: 'alignItemsCenter' }}>
          <FlexItem grow={{ default: 'grow' }}>
            <Title headingLevel="h2" size="lg">
              Group mapping
            </Title>
          </FlexItem>
          <FlexItem>
            <Flex gap={{ default: 'gapMd' }}>
              <FlexItem>
                <Button variant="primary" onClick={handleSave} isLoading={isSaving} isDisabled={isSaving}>
                  Save mapping
                </Button>
              </FlexItem>
              <FlexItem>
                <Button variant="link" onClick={handleCancel}>
                  Cancel
                </Button>
              </FlexItem>
            </Flex>
          </FlexItem>
        </Flex>
      </FlexItem>
      {signInAlert && (
        <FlexItem>
          <Alert
            variant={signInAlert.variant}
            title={signInAlertTitle(signInAlert.variant)}
            isInline
            actionClose={<AlertActionCloseButton onClose={() => setSignInAlert(null)} />}
          >
            {signInAlert.message}
          </Alert>
        </FlexItem>
      )}
      <FlexItem>
        <MappingTable
          entries={entries}
          nexusGroups={nexusGroups}
          showValidation={showValidation}
          onChange={handleEntryChange}
          onRemove={handleRemove}
          onAdd={handleAdd}
          onCreateGroup={setCreateGroupForIndex}
        />
        <Button
          variant="link"
          onClick={openTestSignIn}
          icon={<RhUiSyncIcon />}
          isLoading={isListening}
          isDisabled={isListening}
          style={{ marginTop: 'var(--pf-t--global--spacer--sm)' }}
        >
          {isListening ? 'Waiting for sign-in...' : 'Re-discover groups'}
        </Button>
      </FlexItem>
      <FlexItem>
        <AdvancedSection
          expression={expression}
          onExpressionChange={setExpression}
          defaultExpression={defaultExpression}
          idpType={idpType}
          rawClaims={rawClaims}
        />
      </FlexItem>
      <GroupFormModal
        isOpen={createGroupForIndex !== null}
        initialName={createGroupForIndex !== null ? entries[createGroupForIndex]?.idpGroupValue : undefined}
        onClose={() => setCreateGroupForIndex(null)}
        onSuccess={handleGroupCreated}
      />
    </Flex>
  )
}
