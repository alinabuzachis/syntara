import { Button, EmptyState, EmptyStateBody, Stack, StackItem, Tab, Tabs } from '@patternfly/react-core'
import { RhUiLockIcon } from '@patternfly/react-icons'
import { useCallback, useMemo, useState } from 'react'

import { AppPage, AppPageMain } from '../../../app/AppPage'
import { AppPageHeader } from '../../../app/AppPageHeader'
import { settingsClient } from '../../../client'
import { useAlerts } from '../../../components/alerts'
import { AppPanel } from '../../../components/AppPanel'
import { useQueryState } from '../../../components/states/useQueryState'
import { useMutationErrorHandler } from '../../../hooks/useMutationErrorHandler'
import { getErrorCode } from '../../../utils/apiErrors'
import { detachPromise } from '../../../utils/detachPromise'

import { SettingsCategoryTab } from './SettingsCategoryTab'
import { useSettingsPermissions } from './useSettingsPermissions'

export default function Settings() {
  const [activeTab, setActiveTab] = useState(0)
  const [edits, setEdits] = useState<Map<string, unknown>>(new Map())
  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set())
  const { showSuccess, showError } = useAlerts()
  const handleMutationError = useMutationErrorHandler()
  const { canRead, canWrite } = useSettingsPermissions()

  const categoriesQuery = settingsClient.useQuery('get', '/settings/categories', { enabled: canRead })
  const settingsQuery = settingsClient.useQuery('get', '/settings', {
    params: { query: { limit: 100 } },
    enabled: canRead,
  })

  const { mutate: bulkUpdate, isPending: isSaving } = settingsClient.useMutation('patch', '/settings')

  const categoriesState = useQueryState(categoriesQuery, {
    title: 'Error loading setting categories',
    onRetry: () => detachPromise(categoriesQuery.refetch()),
  })
  const settingsState = useQueryState(settingsQuery, {
    title: 'Error loading settings',
    onRetry: () => detachPromise(settingsQuery.refetch()),
  })

  const categories = categoriesQuery.data?.results ?? []
  const allSettings = useMemo(() => settingsQuery.data?.resources ?? [], [settingsQuery.data?.resources])

  const settingsByCategory = useMemo(() => {
    const grouped = new Map<string, (typeof allSettings)[number][]>()
    for (const setting of allSettings) {
      const cat = setting.category
      if (!grouped.has(cat)) grouped.set(cat, [])
      grouped.get(cat)!.push(setting)
    }
    return grouped
  }, [allSettings])

  const handleChange = useCallback((key: string, value: unknown) => {
    setEdits((prev) => {
      const next = new Map(prev)
      next.set(key, value)
      return next
    })
  }, [])

  const handleValidationChange = useCallback((key: string, hasError: boolean) => {
    setValidationErrors((prev) => {
      const next = new Set(prev)
      if (hasError) next.add(key)
      else next.delete(key)
      return next
    })
  }, [])

  const handleResetField = useCallback(
    (key: string) => {
      const setting = allSettings.find((s) => s.key === key)
      if (!setting) return
      setEdits((prev) => {
        const next = new Map(prev)
        next.set(key, setting.default_value)
        return next
      })
    },
    [allSettings]
  )

  const handleSave = useCallback(() => {
    const updates = Array.from(edits.entries()).reduce<
      Array<{ key: string; value: unknown; expected_version: number }>
    >((acc, [key, value]) => {
      const setting = allSettings.find((s) => s.key === key)
      if (setting) acc.push({ key, value, expected_version: setting.version })
      return acc
    }, [])

    bulkUpdate(
      { body: { updates } },
      {
        onSuccess: () => {
          setEdits(new Map())
          showSuccess({ title: 'Settings saved', description: 'Your changes have been saved successfully.' })
          detachPromise(settingsQuery.refetch())
        },
        onError: (err) => {
          if (getErrorCode(err) === 'VERSION_CONFLICT') {
            showError({
              title: 'Version conflict',
              description: 'Settings were modified by another user. The page has been refreshed.',
            })
            detachPromise(settingsQuery.refetch())
            setEdits(new Map())
          } else {
            handleMutationError({ title: 'Save failed' })(err)
          }
        },
      }
    )
  }, [edits, allSettings, bulkUpdate, showSuccess, showError, handleMutationError, settingsQuery])

  const hasChanges = edits.size > 0
  const hasValidationErrors = validationErrors.size > 0

  if (!canRead) {
    return (
      <AppPage>
        <AppPageHeader title="Settings" />
        <StackItem isFilled>
          <AppPanel isFullHeight>
            <EmptyState headingLevel="h2" titleText="Access denied" icon={RhUiLockIcon} isFullHeight>
              <EmptyStateBody>
                You don&apos;t have permission to view settings. Contact your administrator to request the auditor or
                admin role.
              </EmptyStateBody>
            </EmptyState>
          </AppPanel>
        </StackItem>
      </AppPage>
    )
  }

  if (categoriesState) {
    return (
      <AppPage>
        <AppPageHeader title="Settings" />
        <AppPageMain>
          <AppPanel isFullHeight>{categoriesState}</AppPanel>
        </AppPageMain>
      </AppPage>
    )
  }

  if (settingsState) {
    return (
      <AppPage>
        <AppPageHeader title="Settings" />
        <AppPageMain>
          <AppPanel isFullHeight>{settingsState}</AppPanel>
        </AppPageMain>
      </AppPage>
    )
  }

  return (
    <AppPage>
      <AppPageHeader title="Settings">
        {canWrite && (
          <Button
            variant="primary"
            onClick={handleSave}
            isDisabled={!hasChanges || isSaving || hasValidationErrors}
            isLoading={isSaving}
          >
            Save changes
          </Button>
        )}
      </AppPageHeader>
      <AppPageMain>
        <AppPanel isFullHeight>
          <Stack hasGutter style={{ flex: 1, minHeight: 0, height: '100%' }}>
            <StackItem>
              <Tabs
                activeKey={activeTab}
                onSelect={(_event, key) => setActiveTab(Number(key))}
                aria-label="Settings categories"
              >
                {categories.map((cat, index) => (
                  <Tab key={cat.slug} eventKey={index} title={cat.name} />
                ))}
              </Tabs>
            </StackItem>
            <AppPageMain style={{ overflow: 'auto', padding: 'var(--pf-t--global--spacer--md)' }}>
              {categories[activeTab] && (
                <SettingsCategoryTab
                  settings={settingsByCategory.get(categories[activeTab].slug) ?? []}
                  edits={edits}
                  onChange={handleChange}
                  onResetField={handleResetField}
                  onValidationChange={handleValidationChange}
                  readOnly={!canWrite}
                />
              )}
            </AppPageMain>
          </Stack>
        </AppPanel>
      </AppPageMain>
    </AppPage>
  )
}
