import type { IntegrationsAPI } from '@ansible/nexus-contracts'
import { Content, ContentVariants, Stack, StackItem, Truncate } from '@patternfly/react-core'
import { Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useNavigate } from '@tanstack/react-router'
import { useCallback, useState } from 'react'

import { AppRoute } from '../../../app/AppRoute'
import { stackPaddingLgOnlyStyle } from '../../../app/panelContentStackStyle'
import { integrationsClient } from '../../../client'
import { NxPageBody } from '../../../components/layout/NxPage'
import { NxPanelContentStack } from '../../../components/layout/NxPanelContentStack'
import { NxEmptyStateNoData } from '../../../components/states/NxEmptyStateNoData'
import { useQueryState } from '../../../components/states/useQueryState'
import { NxScrollableTableContainer } from '../../../components/table/NxScrollableTableContainer'
import { detachPromise } from '../../../utils/detachPromise'
import { INTEGRATION_TYPE_LABELS } from '../integrations/integrationFilters'
import { StatusLabel } from '../integrations/StatusLabel'

type Integration = IntegrationsAPI.components['schemas']['IntegrationRead']

type CredentialIntegrationsTabProps = {
  credentialId: string
}

const DASH = '—'
const nameStyle = { fontWeight: 600, margin: 0, color: 'var(--pf-t--global--color--brand--default)' } as const
const descriptionStyle = { margin: 0, color: 'var(--pf-t--global--text--color--subtle)' } as const

export function CredentialIntegrationsTab({ credentialId }: Readonly<CredentialIntegrationsTabProps>) {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)

  const handlePerPageChange = useCallback((newPerPage: number) => {
    setPerPage(newPerPage)
    setPage(1)
  }, [])

  const query = integrationsClient.useQuery('get', '/integrations', {
    params: { query: { management_credential_id: credentialId } },
  })
  const integrations = (query.data?.resources ?? []) as Integration[]

  const queryState = useQueryState(query, {
    title: 'Failed to load integrations',
    onRetry: () => detachPromise(query.refetch()),
  })

  if (queryState) {
    return (
      <Stack hasGutter style={stackPaddingLgOnlyStyle}>
        <StackItem>{queryState}</StackItem>
      </Stack>
    )
  }

  if (integrations.length === 0) {
    return (
      <NxEmptyStateNoData
        title="No integrations using this credential"
        description="This credential is not currently referenced by any integrations. Integrations will appear here once they are configured to use this credential."
      />
    )
  }

  const paginatedIntegrations = integrations.slice((page - 1) * perPage, page * perPage)

  return (
    <NxPanelContentStack style={{ padding: 'var(--pf-t--global--spacer--lg)' }}>
      <NxPageBody style={{ overflow: 'auto' }}>
        <NxScrollableTableContainer
          caption="Integrations using this credential"
          footer={{
            page,
            perPage,
            total: integrations.length,
            hasNext: page * perPage < integrations.length,
            onPrev: () => setPage((p) => Math.max(1, p - 1)),
            onNext: () => setPage((p) => p + 1),
            onPerPageChange: handlePerPageChange,
          }}
        >
          <Thead>
            <Tr>
              <Th>Integration Name</Th>
              <Th>Type</Th>
              <Th>Created By</Th>
              <Th>Status</Th>
              <Th>Scope</Th>
            </Tr>
          </Thead>
          <Tbody>
            {paginatedIntegrations.map((integration) => (
              <Tr
                key={integration.id}
                isClickable
                onRowClick={() => {
                  detachPromise(
                    navigate({
                      to: AppRoute.Configuration.Integrations.Detail.replace(':integrationId', integration.id ?? ''),
                    })
                  )
                }}
              >
                <Td dataLabel="Integration Name">
                  <Content component={ContentVariants.p} style={nameStyle}>
                    {integration.name}
                  </Content>
                  {integration.description && (
                    <Content component={ContentVariants.small} style={descriptionStyle}>
                      <Truncate content={integration.description} />
                    </Content>
                  )}
                </Td>
                <Td dataLabel="Type">
                  {INTEGRATION_TYPE_LABELS[integration.integration_type ?? ''] ?? integration.integration_type ?? ''}
                </Td>
                <Td dataLabel="Created By">
                  <Truncate content={integration.created_by ?? DASH} />
                </Td>
                <Td dataLabel="Status">
                  <StatusLabel
                    status={integration.validation_status ?? 'unknown'}
                    errorMessage={integration.validation_error}
                  />
                </Td>
                <Td dataLabel="Scope">{integration.scope === 'project' ? 'Project' : 'Global'}</Td>
              </Tr>
            ))}
          </Tbody>
        </NxScrollableTableContainer>
      </NxPageBody>
    </NxPanelContentStack>
  )
}
